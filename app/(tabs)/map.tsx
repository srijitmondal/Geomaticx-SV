import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Modal,
  Image,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SurveyCameraView, CameraRef, LocationData, SensorData } from './camera';
import { eventEmitter, EVENTS } from '../../utils/events';
import * as FileSystem from 'expo-file-system';

interface MarkerData {
  id: number;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  centerPollImage: string | null; // Center poll image (mandatory)
  connectionImages: string[]; // Connection images
  connectionCount: number;
  isComplete: boolean;
}

interface ArrowData {
  start: {
    latitude: number;
    longitude: number;
  };
  end: {
    latitude: number;
    longitude: number;
  };
  heading: number;
  markerId: number;
  connectionIndex: number;
}

interface CaptureResult {
  uri: string;
  location: LocationData | null;
  sensorData: SensorData;
  timestamp: number;
}

const STORAGE_KEY = 'map_markers';

const Map = () => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState(false);
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<MarkerData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [importedShapes, setImportedShapes] = useState<GeoJSON.FeatureCollection | null>(null);
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState(-1);
  const [connectionDeleteConfirmVisible, setConnectionDeleteConfirmVisible] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [currentCaptureTarget, setCurrentCaptureTarget] = useState<'centerPoll' | number>('centerPoll');
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  const [arrows, setArrows] = useState<ArrowData[]>([]);
  const [selectedArrowImage, setSelectedArrowImage] = useState<string | null>(null);
  const [arrowImageModalVisible, setArrowImageModalVisible] = useState(false);
  const [showArrows, setShowArrows] = useState(true);

  const zoomToCurrentLocation = useCallback(async () => {
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      if (mapRef.current && currentLocation) {
        mapRef.current.animateToRegion({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.0006, // Closer zoom level
          longitudeDelta: 0.0006,
        });
      }
      setLocation(currentLocation);
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Location Error', 'Unable to get current location. Please check your GPS settings.');
    }
  }, []);

  const getCurrentLocationWithRetry = async () => {
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);
      setErrorMsg(null);

      if (mapRef.current && currentLocation) {
        mapRef.current.animateToRegion({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.0004,
          longitudeDelta: 0.0004,
        });
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error getting location:', error);
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          getCurrentLocationWithRetry();
        }, RETRY_DELAY);
      } else {
        setErrorMsg('Unable to get location. Please check your GPS settings and try again.');
        setIsLoading(false);
      }
    }
  };

  // Location subscription for real-time updates
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setIsLoading(false);
          return;
        }

        // Get initial location
        getCurrentLocationWithRetry();

        // Subscribe to location updates with optimized settings
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10, // Update every 10 meters
            timeInterval: 5000, // Or every 5 seconds
          },
          (newLocation) => {
            if (isMounted) {
              setLocation(newLocation);
            }
          }
        );
      } catch (error) {
        console.error('Error in location setup:', error);
        if (isMounted) {
          setErrorMsg('Location services error. Please try again.');
          setIsLoading(false);
        }
      }
    })();

    // Cleanup subscription and prevent memory leaks
    return () => {
      isMounted = false;
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [retryCount]);

  const currentLocation = useMemo(() => {
    if (!location) return null;
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.0005,
      longitudeDelta: 0.0005
    };
  }, [location?.coords.latitude, location?.coords.longitude]);

  // Memoized marker counts
  const markerCounts = useMemo(() => {
    const complete = markers.filter(marker => marker.isComplete).length;
    const incomplete = markers.length - complete;
    return { complete, incomplete };
  }, [markers]);

  useEffect(() => {
    setCompletedCount(markerCounts.complete);
    setIncompleteCount(markerCounts.incomplete);
  }, [markerCounts]);

  // Load markers from AsyncStorage on component mount
  useEffect(() => {
    // clearStorageOnce();
    loadMarkers();
  }, []);

  // Update marker counts whenever markers change
  const loadMarkers = async () => {
    try {
      const storedMarkers = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedMarkers) {
        setMarkers(JSON.parse(storedMarkers));
      }
    } catch (error) {
      console.error('Failed to load markers from storage', error);
    }
  };

  //temporary function to remove previous data
  // const clearStorageOnce = async () => {
  //   try {
  //     await AsyncStorage.removeItem('map_markers');
  //     console.log('✅ Cleared saved markers!');
  //   } catch (error) {
  //     console.error('❌ Failed to clear markers', error);
  //   }
  // };
  
  
  const saveMarkers = async (markersToSave: MarkerData[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(markersToSave));
    } catch (error) {
      console.error('Failed to save markers to storage', error);
    }
  };

  const handleMarkerPress = useCallback((marker: MarkerData) => {
    setSelectedMarker(marker);
    setModalVisible(true);
  }, []);

  // Optimize marker rendering
  const renderedMarkers = useMemo(() => (
    markers.map(marker => (
      <Marker
        key={`${marker.id}-${marker.isComplete}`}
        coordinate={marker.coordinate}
        pinColor={marker.isComplete ? "green" : "yellow"}
        onPress={() => handleMarkerPress(marker)}
        tracksViewChanges={false}
      />
    ))
  ), [markers, handleMarkerPress]);

  // Add map ready handler
  const onMapReady = useCallback(() => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0007,
        longitudeDelta: 0.0007,
      });
    }
  }, [location]);

  // Optimize map component with useCallback
  const handleRegionChange = useCallback(() => {
    // Add debounced region change handling if needed
  }, []);

  const handleMapPress = useCallback((event: any) => {
    if (!editingMode) return;

    const newMarker: MarkerData = {
      id: Date.now(),
      coordinate: event.nativeEvent.coordinate,
      centerPollImage: null,
      connectionImages: [],
      connectionCount: 1,
      isComplete: false,
    };

    const updatedMarkers = [...markers, newMarker];
    setMarkers(updatedMarkers);
    saveMarkers(updatedMarkers);
  }, [editingMode, markers]);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleConnectionCountChange = (connectionCount: number) => {
    if (selectedMarker) {
      const updatedMarkers = markers.map(marker => {
        if (marker.id === selectedMarker.id) {
          // Check if all required images are uploaded (center poll + connection images)
          const isComplete = 
          Boolean(marker.centerPollImage) && 
          (marker.connectionImages || []).length >= connectionCount;
            
          return {
            ...marker,
            connectionCount,
            isComplete
          };
        }
        return marker;
      });
      
      setMarkers(updatedMarkers);
      saveMarkers(updatedMarkers);
      
      // Update selected marker with new connection count
      const updatedMarker = updatedMarkers.find(m => m.id === selectedMarker.id);
      if (updatedMarker) {
        setSelectedMarker(updatedMarker);
      }
      
      // Hide dropdown after selection
      setDropdownVisible(false);
    }
  };

  // Camera capture handlers
  const handleCameraCapture = (result: CaptureResult) => {
    if (selectedMarker) {
      let updatedMarkers;

      if (currentCaptureTarget === 'centerPoll') {
        updatedMarkers = markers.map(marker => {
          if (marker.id === selectedMarker.id) {
            // Check if all required images are uploaded
            const updatedMarker = {
              ...marker,
              centerPollImage: result.uri
            };
            
            const isComplete = 
              Boolean(updatedMarker.centerPollImage) && 
              updatedMarker.connectionImages.length >= updatedMarker.connectionCount;
              
            return {
              ...updatedMarker,
              isComplete
            };
          }
          return marker;
        });
      } else {
        // It's a connection image (index is stored in currentCaptureTarget)
        const connectionIndex = currentCaptureTarget as number;
        
        // First get a copy of the current marker
        const markerToUpdate = markers.find(m => m.id === selectedMarker.id);
        
        if (markerToUpdate) {
          // Create a copy of the images array
          const updatedImages = [...markerToUpdate.connectionImages];
          
          // If this is a specific index update, make sure the array has enough elements
          while (updatedImages.length <= connectionIndex) {
            updatedImages.push("");
          }
          
          // Set the image at the specific index
          updatedImages[connectionIndex] = result.uri;
          
          // Remove empty strings
          const cleanedImages = updatedImages.filter(img => img !== "");
          
          updatedMarkers = markers.map(marker => {
            if (marker.id === selectedMarker.id) {
              // Check if all required images are uploaded
              const isComplete = 
                Boolean(marker.centerPollImage) && 
                cleanedImages.length >= marker.connectionCount;
                
              return {
                ...marker,
                connectionImages: cleanedImages,
                isComplete
              };
            }
            return marker;
          });
        } else {
          updatedMarkers = [...markers];
        }
      }

      setMarkers(updatedMarkers);
      saveMarkers(updatedMarkers);

      // Update the selected marker
      const updatedMarker = updatedMarkers.find(m => m.id === selectedMarker.id);
      if (updatedMarker) {
        setSelectedMarker(updatedMarker);
      }
    }
    
    setShowCamera(false);
  };

  const openCameraForCenterPoll = () => {
    setCurrentCaptureTarget('centerPoll');
    setShowCamera(true);
  };

  const openCameraForConnection = (index: number) => {
    setCurrentCaptureTarget(index);
    setShowCamera(true);
  };

  const openGalleryOrCameraPrompt = (target: 'centerPoll' | number) => {
    Alert.alert(
      "Choose an option",
      "Would you like to take a photo or choose from gallery?",
      [
        {
          text: "Take Photo",
          onPress: () => {
            if (target === 'centerPoll') {
              openCameraForCenterPoll();
            } else {
              openCameraForConnection(target as number);
            }
          }
        },
        {
          text: "Choose from Gallery",
          onPress: () => {
            if (target === 'centerPoll') {
              pickCenterPollImage();
            } else {
              pickConnectionImage(target as number);
            }
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const pickCenterPollImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'You need to grant access to your photos to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets && (result.assets || []).length > 0) {
      if (selectedMarker) {
        const updatedMarkers = markers.map(marker => {
          if (marker.id === selectedMarker.id) {
            // Check if all required images are uploaded
            const updatedMarker = {
              ...marker,
              centerPollImage: result.assets[0].uri
            };
            
            const isComplete = 
              Boolean(updatedMarker.centerPollImage) && 
              updatedMarker.connectionImages.length >= updatedMarker.connectionCount;
              
            return {
              ...updatedMarker,
              isComplete
            };
          }
          return marker;
        });
  
        setMarkers(updatedMarkers);
        saveMarkers(updatedMarkers);
  
        // Update the selected marker
        const updatedMarker = updatedMarkers.find(m => m.id === selectedMarker.id);
        if (updatedMarker) {
          setSelectedMarker(updatedMarker);
        }
      }
    }
  };

  const pickConnectionImage = async (index: number) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'You need to grant access to your photos to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets && (result.assets || []).length > 0) {
      if (selectedMarker) {
        // Create a copy of the images array
        const updatedImages = [...selectedMarker.connectionImages];
        
        // If this is a specific index update, make sure the array has enough elements
        while ((updatedImages || []).length <= index) {
          updatedImages.push("");
        }
        
        // Set the image at the specific index
        updatedImages[index] = result.assets[0].uri;
        
        // Remove empty strings
        const cleanedImages = updatedImages.filter(img => img !== "");
        
        const updatedMarkers = markers.map(marker => {
          if (marker.id === selectedMarker.id) {
            // Check if all required images are uploaded (center poll + connection images)
            const isComplete = Boolean(marker.centerPollImage) && (cleanedImages|| []).length >= marker.connectionCount;
              
            return {
              ...marker,
              connectionImages: cleanedImages,
              isComplete: isComplete,
            };
          }
          return marker;
        });
  
        setMarkers(updatedMarkers);
        saveMarkers(updatedMarkers);
  
        // Update the selected marker
        const updatedMarker = updatedMarkers.find(m => m.id === selectedMarker.id);
        if (updatedMarker) {
          setSelectedMarker(updatedMarker);
        }
      }
    }
  };

  const confirmRemoveConnection = (index: number) => {
    setSelectedConnectionIndex(index);
    setConnectionDeleteConfirmVisible(true);
  };

  const removeConnection = () => {
    if (selectedMarker && selectedConnectionIndex >= 0) {
      // Create a copy of the connection images array
      const updatedImages = [...selectedMarker.connectionImages];
      
      // Remove the image at the selected index
      updatedImages.splice(selectedConnectionIndex, 1);
      
      const updatedMarkers = markers.map(marker => {
        if (marker.id === selectedMarker.id) {
          // Check if the marker is still complete after removal
          const isComplete = 
            Boolean(marker.centerPollImage) && 
            updatedImages.length >= marker.connectionCount;
          
          return {
            ...marker,
            connectionImages: updatedImages,
            isComplete
          };
        }
        return marker;
      });
      
      setMarkers(updatedMarkers);
      saveMarkers(updatedMarkers);
      
      // Update the selected marker
      const updatedMarker = updatedMarkers.find(m => m.id === selectedMarker.id);
      if (updatedMarker) {
        setSelectedMarker(updatedMarker);
      }
      
      // Reset and close confirmation modal
      setSelectedConnectionIndex(-1);
      setConnectionDeleteConfirmVisible(false);
    }
  };

  const deleteMarker = () => {
    if (selectedMarker) {
      const updatedMarkers = markers.filter(marker => marker.id !== selectedMarker.id);
      setMarkers(updatedMarkers);
      saveMarkers(updatedMarkers);
      setDeleteConfirmVisible(false);
      setModalVisible(false);
    }
  };

  const toggleEditingMode = () => {
    setEditingMode(!editingMode);
  };

  // Convert location object to LocationData format needed by camera
  const getCurrentLocationData = (): LocationData | null => {
    if (!location) return null;
    
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude,
      accuracy: location.coords.accuracy ?? 0
    };
  };

  // Custom dropdown component
  const renderCustomDropdown = () => {
    if (!selectedMarker) return null;

    return (
      <View style={styles.dropdownContainer}>
        <TouchableOpacity 
          style={styles.dropdownButton}
          onPress={() => setDropdownVisible(!dropdownVisible)}
        >
          <Text style={styles.dropdownButtonText}>
            {selectedMarker.connectionCount} Connections
          </Text>
          <FontAwesome 
            name={dropdownVisible ? "chevron-up" : "chevron-down"} 
            size={16} 
            color="#000" 
          />
        </TouchableOpacity>
        
        {dropdownVisible && (
          <View style={styles.dropdownMenu}>
            {[1, 2, 3, 4, 5, 6].map(num => (
              <TouchableOpacity
                key={num}
                style={[
                  styles.dropdownItem,
                  selectedMarker.connectionCount === num && styles.selectedDropdownItem
                ]}
                onPress={() => handleConnectionCountChange(num)}
              >
                <Text 
                  style={[
                    styles.dropdownItemText,
                    selectedMarker.connectionCount === num && styles.selectedDropdownItemText
                  ]}
                >
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Render the center poll image upload section
  const renderCenterPollUpload = () => {
    if (!selectedMarker) return null;
    
    return (
      <View style={styles.centerPollContainer}>
        <Text style={styles.centerPollTitle}>Center Poll (Required)</Text>
        {selectedMarker.centerPollImage ? (
          <View style={styles.uploadedImageContainer}>
            <Image 
              source={{ uri: selectedMarker.centerPollImage }} 
              style={styles.uploadedImage} 
            />
            <TouchableOpacity 
              style={styles.replaceButton}
              onPress={() => openGalleryOrCameraPrompt('centerPoll')}
            >
              <Text style={styles.replaceButtonText}>Replace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.uploadButton, styles.centerPollUploadButton]}
            onPress={() => openGalleryOrCameraPrompt('centerPoll')}
          >
            <FontAwesome name="camera" size={30} color="#666" />
            <Text style={styles.uploadText}>
              Upload Center Poll Image
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Helper function to create empty upload slots based on connection count
  const renderConnectionUploads = () => {
    if (!selectedMarker) return null;
    
    const slots = [];
    for (let i = 0; i < selectedMarker.connectionCount; i++) {
      const imageExists = i < selectedMarker.connectionImages.length;
      
      slots.push(
        <View key={i} style={styles.uploadSlot}>
          <View style={styles.uploadSlotHeader}>
            <Text style={styles.uploadSlotTitle}>Connection {i + 1}</Text>
            {imageExists && (
              <TouchableOpacity
                style={styles.removeConnectionButton}
                onPress={() => confirmRemoveConnection(i)}
              >
                <FontAwesome name="times" size={16} color="red" />
              </TouchableOpacity>
            )}
          </View>
          
          {imageExists ? (
            <View style={styles.uploadedImageContainer}>
              <Image 
                source={{ uri: selectedMarker.connectionImages[i] }} 
                style={styles.uploadedImage} 
              />
              <TouchableOpacity 
                style={styles.replaceButton}
                onPress={() => openGalleryOrCameraPrompt(i)}
              >
                <Text style={styles.replaceButtonText}>Replace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => openGalleryOrCameraPrompt(i)}
            >
              <FontAwesome name="camera" size={30} color="#666" />
              <Text style={styles.uploadText}>
                Upload Connection Image
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    
    return slots;
  };

  // Load imported shapes from storage
  useEffect(() => {
    const loadShapes = async () => {
      try {
        const shapes = await AsyncStorage.getItem('imported_shapes');
        if (shapes) {
          setImportedShapes(JSON.parse(shapes));
        }
      } catch (error) {
        console.error('Error loading shapes:', error);
      }
    };

    loadShapes();

    // Listen for new shape imports
    const unsubscribe = eventEmitter.on(EVENTS.SHAPE_IMPORT, (shapes: GeoJSON.FeatureCollection) => {
      setImportedShapes(shapes);
    });

    return () => {
      unsubscribe.off(EVENTS.SHAPE_IMPORT);
    };
  }, []);

  // Convert GeoJSON coordinates to react-native-maps format
  const polygons = useMemo(() => {
    if (!importedShapes) return [];

    return importedShapes.features
      .filter(feature => feature.geometry.type === 'Polygon')
      .map((feature, index) => {
        const polygon = feature.geometry as GeoJSON.Geometry & { coordinates: number[][][] };
        const coordinates = polygon.coordinates[0].map(coord => ({
          latitude: coord[1],
          longitude: coord[0]
        }));

        return (
          <Polygon
            key={`polygon-${index}`}
            coordinates={coordinates}
            fillColor="rgba(0, 200, 0, 0.3)"
            strokeColor="rgba(0, 200, 0, 0.8)"
            strokeWidth={2}
          />
        );
      });
  }, [importedShapes]);

  // Helper function to calculate end point of arrow based on heading and distance
  const calculateArrowEndPoint = (
    startLat: number,
    startLng: number,
    heading: number,
    distance: number = 0.0001 // Default distance in degrees (approximately 10 meters)
  ): { latitude: number; longitude: number } => {
    // Convert heading to radians
    const headingRad = (heading * Math.PI) / 180;
    
    // Calculate the change in latitude and longitude
    const latChange = distance * Math.cos(headingRad);
    const lngChange = distance * Math.sin(headingRad);
    
    return {
      latitude: startLat + latChange,
      longitude: startLng + lngChange
    };
  };

  // Function to generate arrows from marker data
  const generateArrows = useCallback(async (markers: MarkerData[]) => {
    const newArrows: ArrowData[] = [];
    
    for (const marker of markers) {
      if (!marker.centerPollImage) continue;
      
      // Read metadata for center pole
      const centerPoleMetadataUri = `${marker.centerPollImage}.json`;
      try {
        const centerPoleMetadata = await FileSystem.readAsStringAsync(centerPoleMetadataUri);
        const metadata = JSON.parse(centerPoleMetadata);
        
        // Generate arrows for each connection image
        for (let i = 0; i < marker.connectionImages.length; i++) {
          const connectionImage = marker.connectionImages[i];
          const connectionMetadataUri = `${connectionImage}.json`;
          
          try {
            const connectionMetadata = await FileSystem.readAsStringAsync(connectionMetadataUri);
            const connectionData = JSON.parse(connectionMetadata);
            
            // Calculate arrow end point based on heading
            const endPoint = calculateArrowEndPoint(
              marker.coordinate.latitude,
              marker.coordinate.longitude,
              connectionData.sensors.compass.heading
            );
            
            newArrows.push({
              start: marker.coordinate,
              end: endPoint,
              heading: connectionData.sensors.compass.heading,
              markerId: marker.id,
              connectionIndex: i
            });
          } catch (error) {
            console.error('Error reading connection metadata:', error);
          }
        }
      } catch (error) {
        console.error('Error reading center pole metadata:', error);
      }
    }
    
    setArrows(newArrows);
  }, []);

  // Update arrows when markers change
  useEffect(() => {
    generateArrows(markers);
  }, [markers, generateArrows]);

  // Handle arrow press
  const handleArrowPress = (arrow: ArrowData) => {
    const marker = markers.find(m => m.id === arrow.markerId);
    if (marker && marker.connectionImages[arrow.connectionIndex]) {
      setSelectedArrowImage(marker.connectionImages[arrow.connectionIndex]);
      setArrowImageModalVisible(true);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {errorMsg ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => {
              setRetryCount(0);
              setIsLoading(true);
              setErrorMsg(null);
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {showCamera ? (
            <SurveyCameraView
              ref={cameraRef}
              onCapture={handleCameraCapture}
              onError={(error) => {
                console.error('Camera error:', error);
                setShowCamera(false);
              }}
              initialLocation={getCurrentLocationData() ?? undefined}
              showOverlay={true}
            />
          ) : (
            <>
              <MapView
                ref={mapRef}
                style={styles.map}
                mapType="satellite"
                showsUserLocation
                showsMyLocationButton={false}
                onPress={handleMapPress}
                onMapReady={onMapReady}
                onRegionChange={handleRegionChange}
                loadingEnabled={true}
                moveOnMarkerPress={false}
                {...(currentLocation ? { initialRegion: currentLocation } : {})}
              >
                {renderedMarkers}
                {polygons}
                {showArrows && arrows.map((arrow, index) => (
                  <Polygon
                    key={`arrow-${index}`}
                    coordinates={[
                      arrow.start,
                      arrow.end,
                      calculateArrowEndPoint(
                        arrow.end.latitude,
                        arrow.end.longitude,
                        (arrow.heading + 150) % 360,
                        0.00002
                      ),
                      arrow.end,
                      calculateArrowEndPoint(
                        arrow.end.latitude,
                        arrow.end.longitude,
                        (arrow.heading - 150) % 360,
                        0.00002
                      ),
                      arrow.end
                    ]}
                    fillColor="rgba(255, 0, 0, 0.5)"
                    strokeColor="rgba(255, 0, 0, 0.8)"
                    strokeWidth={2}
                    tappable={true}
                    onPress={() => handleArrowPress(arrow)}
                  />
                ))}
              </MapView>

              <TouchableOpacity
                style={[styles.locationButton]}
                onPress={zoomToCurrentLocation}
              >
                <FontAwesome
                  name="location-arrow"
                  size={24}
                  color="#000"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.editButton,
                  editingMode ? styles.editButtonActive : null,
                ]}
                onPress={toggleEditingMode}
              >
                <FontAwesome
                  name="edit"
                  size={24}
                  color={editingMode ? '#fff' : '#000'}
                />
              </TouchableOpacity>

              {/* Add Arrow Toggle Button */}
              <TouchableOpacity
                style={[
                  styles.arrowToggleButton,
                  showArrows ? styles.arrowToggleButtonActive : null,
                ]}
                onPress={() => setShowArrows(!showArrows)}
              >
                <FontAwesome
                  name="arrows-alt"
                  size={24}
                  color={showArrows ? '#fff' : '#000'}
                />
              </TouchableOpacity>

              {/* Status bar for marker counts */}
              <View style={styles.statusBar}>
                <View style={styles.statusItem}>
                  <View style={[styles.statusIndicator, styles.completedIndicator]} />
                  <Text style={styles.statusText}>Completed: {completedCount}</Text>
                </View>
                <View style={styles.statusItem}>
                  <View style={[styles.statusIndicator, styles.incompleteIndicator]} />
                  <Text style={styles.statusText}>Incomplete: {incompleteCount}</Text>
                </View>
              </View>
            </>
          )}

          {/* Main Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={modalVisible && !showCamera}
            onRequestClose={handleModalClose}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    Marker ID: {selectedMarker?.id}
                  </Text>
                  <View style={styles.headerButtons}>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => setDeleteConfirmVisible(true)}
                    >
                      <FontAwesome name="trash" size={24} color="red" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setModalVisible(false)}
                      style={styles.closeButton}
                    >
                      <FontAwesome name="close" size={24} color="#000" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.connectionSelector}>
                  <Text style={styles.connectionLabel}>Number of Connections:</Text>
                  {/* Custom dropdown component */}
                  {renderCustomDropdown()}
                </View>

                <Text style={styles.imagesHeader}>
                  Upload {selectedMarker ? selectedMarker.connectionCount + 1 : 2} Images 
                </Text>

                <ScrollView style={styles.uploadSlotsContainer}>
                  {/* Center Poll Upload */}
                  {renderCenterPollUpload()}
                  
                  {/* Connection Uploads */}
                  {renderConnectionUploads()}
                </ScrollView>

                {/* Completion status */}
                {selectedMarker?.isComplete && (
                  <View style={styles.completeStatusContainer}>
                    <FontAwesome name="check-circle" size={24} color="green" />
                    <Text style={styles.completeStatusText}>
                      This marker is complete!
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Modal>

          {/* Delete Marker Confirmation Modal */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={deleteConfirmVisible}
            onRequestClose={() => setDeleteConfirmVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.confirmModalContent}>
                <Text style={styles.confirmTitle}>Delete Marker?</Text>
                <Text style={styles.confirmText}>
                  Are you sure you want to delete this marker? This action cannot be undone.
                </Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.cancelButton]}
                    onPress={() => setDeleteConfirmVisible(false)}
                  >
                    <Text style={styles.confirmButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.deleteConfirmButton]}
                    onPress={deleteMarker}
                  >
                    <Text style={[styles.confirmButtonText, styles.deleteText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Delete Connection Confirmation Modal */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={connectionDeleteConfirmVisible}
            onRequestClose={() => setConnectionDeleteConfirmVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.confirmModalContent}>
                <Text style={styles.confirmTitle}>Remove Connection?</Text>
                <Text style={styles.confirmText}>
                  Are you sure you want to remove this connection image? This action cannot be undone.
                </Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.cancelButton]}
                    onPress={() => setConnectionDeleteConfirmVisible(false)}
                  >
                    <Text style={styles.confirmButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.deleteConfirmButton]}
                    onPress={removeConnection}
                  >
                    <Text style={[styles.confirmButtonText, styles.deleteText]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Arrow Image Modal */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={arrowImageModalVisible}
            onRequestClose={() => setArrowImageModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.arrowImageModalContent}>
                <View style={styles.arrowImageModalHeader}>
                  <TouchableOpacity
                    onPress={() => setArrowImageModalVisible(false)}
                    style={styles.closeButton}
                  >
                    <FontAwesome name="close" size={24} color="#000" />
                  </TouchableOpacity>
                </View>
                {selectedArrowImage && (
                  <Image
                    source={{ uri: selectedArrowImage }}
                    style={styles.arrowImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    textAlign: 'center',
    padding: 20,
  },
  editButton: {
    position: 'absolute',
    bottom: 80, // Moved up to make room for status bar
    right: 20,
    backgroundColor: '#fff',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  editButtonActive: {
    backgroundColor: '#4285F4',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    padding: 5,
  },
  deleteButton: {
    padding: 5,
    marginRight: 10,
  },
  connectionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  connectionLabel: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  dropdownContainer: {
    flex: 1,
    position: 'relative',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  dropdownButtonText: {
    fontSize: 16,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginTop: 5,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedDropdownItem: {
    backgroundColor: '#f0f9ff',
  },
  dropdownItemText: {
    fontSize: 16,
  },
  selectedDropdownItemText: {
    fontWeight: '600',
    color: '#0077CC',
  },
  imagesHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  uploadSlotsContainer: {
    maxHeight: 400,
  },
  centerPollContainer: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFC107',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#FFFDE7',
  },
  centerPollTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
    color: '#F57C00',
  },
  centerPollUploadButton: {
    borderColor: '#FFC107',
  },
  uploadSlot: {
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 10,
  },
  uploadSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  uploadSlotTitle: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  removeConnectionButton: {
    padding: 5,
  },
  uploadButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 10,
  },
  uploadText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  uploadedImageContainer: {
    alignItems: 'center',
  },
  uploadedImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  replaceButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  replaceButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  thumbnailImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  noImagesText: {
    textAlign: 'center',
    color: '#666',
    marginVertical: 20,
  },
  completeStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0fff0',
    borderRadius: 8,
  },
  completeStatusText: {
    marginLeft: 10,
    color: 'green',
    fontWeight: '600',
  },
  statusBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
  },
  completedIndicator: {
    backgroundColor: 'green',
  },
  incompleteIndicator: {
    backgroundColor: 'yellow',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Delete confirmation modal styles
  confirmModalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  confirmText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  deleteConfirmButton: {
    backgroundColor: '#ffebee',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  deleteText: {
    color: 'red',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  locationButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#fff',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  arrowImageModalContent: {
    width: '90%',
    height: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  arrowImageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  arrowImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  arrowToggleButton: {
    position: 'absolute',
    bottom: 140, // Positioned above the edit button
    right: 20,
    backgroundColor: '#fff',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  arrowToggleButtonActive: {
    backgroundColor: '#4285F4',
  },
});

export default React.memo(Map);
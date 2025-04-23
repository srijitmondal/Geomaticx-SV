// map.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, PermissionsAndroid, Platform, TouchableOpacity, Modal, Image, Alert, TextInput, ScrollView } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons, FontAwesome, Ionicons } from '@expo/vector-icons';

// Patch for crypto.getRandomValues
import 'react-native-get-random-values';

// @ts-ignore: Fix crypto.getRandomValues error in Expo Go
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    getRandomValues: (array: any) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
  };
}

type MarkerData = {
  id: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  centerImage?: string;
  branchImages: string[];
  branchCount: number;
  status: 'incomplete' | 'complete';
  nextMarkerId?: string; // Reference to the next marker in sequence
  isCurrentLocation?: boolean; // Flag for current location marker
};

const MapScreen = () => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [editingMode, setEditingMode] = useState(false);
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<MarkerData | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [centerImage, setCenterImage] = useState<string | undefined>(undefined);
  const [branchImages, setBranchImages] = useState<string[]>([]);
  const [branchCount, setBranchCount] = useState(0);
  const [temporaryMarker, setTemporaryMarker] = useState<{latitude: number, longitude: number} | null>(null);
  const mapRef = useRef<MapView | null>(null);

  // Helper function to calculate distance between two coordinates in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  // Calculate stats for markers
  const getMarkerStats = () => {
    const completeMarkers = markers.filter(m => m.status === 'complete' && !m.isCurrentLocation).length;
    const incompleteMarkers = markers.filter(m => m.status === 'incomplete' && !m.isCurrentLocation).length;
    
    return { completeMarkers, incompleteMarkers };
  };

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
      }

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        return;
      }

      try {
        let location = await Location.getCurrentPositionAsync({});
        setLocation(location);
        
        // Initialize with current location as first marker
        setMarkers([{
          id: 'current-location',
          coordinate: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          },
          branchImages: [],
          branchCount: 0,
          status: 'complete',
          isCurrentLocation: true
        }]);
      } catch (error) {
        console.error('Error getting location:', error);
      }
    })();
  }, []);

  const handleMapPress = (e: any) => {
    if (editingMode && selectedMarker) {
      const newCoord = e.nativeEvent.coordinate;
      setTemporaryMarker(newCoord);
      setBranchCount(0);
      setBranchImages([]);
      setCenterImage(undefined);
      setImageModalVisible(true);
    }
  };

  const handleMarkerPress = (marker: MarkerData) => {
    if (editingMode) {
      setSelectedMarker(marker);
      Alert.alert(
        'Add Next Pole',
        `Do you want to add the next pole after this one?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setSelectedMarker(null)
          },
          {
            text: 'Continue',
            onPress: () => {
              // Selected marker is already set
            }
          }
        ]
      );
    }
  };

  const startAddingFromCurrentLocation = () => {
    if (!location) return;
    
    const currentLocationMarker = markers.find(m => m.isCurrentLocation);
    if (currentLocationMarker) {
      setSelectedMarker(currentLocationMarker);
      Alert.alert(
        'Start Adding Poles',
        'Start adding poles from your current location?',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Start',
            onPress: () => {
              // Ready to add next pole
            }
          }
        ]
      );
    }
  };

  const saveMarker = () => {
    if (!selectedMarker || !temporaryMarker || !centerImage) return;

    // Check if all branches have images
    const isComplete = branchCount === 0 || (branchImages.length === branchCount && branchImages.every(img => img !== undefined));

    const newMarker: MarkerData = {
      id: Date.now().toString(),
      coordinate: temporaryMarker,
      centerImage: centerImage,
      branchImages: branchImages,
      branchCount: branchCount,
      status: isComplete ? 'complete' : 'incomplete'
    };

    // Update the previous marker to reference this new one
    const updatedMarkers = markers.map(m => {
      if (m.id === selectedMarker.id) {
        return {...m, nextMarkerId: newMarker.id};
      }
      return m;
    });

    setMarkers([...updatedMarkers, newMarker]);
    setCenterImage(undefined);
    setBranchImages([]);
    setBranchCount(0);
    setImageModalVisible(false);
    setSelectedMarker(newMarker); // Auto-select the new marker for continuing
    setTemporaryMarker(null);
  };

  const pickCenterImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setCenterImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const pickBranchImage = async (index: number) => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        const newBranchImages = [...branchImages];
        newBranchImages[index] = result.assets[0].uri;
        setBranchImages(newBranchImages);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const handleBranchCountChange = (text: string) => {
    const count = parseInt(text, 10) || 0;
    setBranchCount(count);
    
    // Initialize or resize branchImages array
    const newBranchImages = [...branchImages];
    newBranchImages.length = count;
    setBranchImages(newBranchImages);
  };

  const focusOnCurrentLocation = () => {
    if (location) {
      mapRef.current?.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  const renderArrow = (from: MarkerData, to: MarkerData) => {
    // Calculate distance
    const distance = calculateDistance(
      from.coordinate.latitude, from.coordinate.longitude,
      to.coordinate.latitude, to.coordinate.longitude
    );
    
    // Calculate midpoint for distance label
    const midPoint = {
      latitude: (from.coordinate.latitude + to.coordinate.latitude) / 2,
      longitude: (from.coordinate.longitude + to.coordinate.longitude) / 2
    };

    // Calculate arrow points
    const headLength = 0.00015; // Length of arrow head
    const dx = to.coordinate.longitude - from.coordinate.longitude;
    const dy = to.coordinate.latitude - from.coordinate.latitude;
    const angle = Math.atan2(dy, dx);
    
    // Arrow head points
    const arrowLeft = {
      latitude: to.coordinate.latitude - headLength * Math.sin(angle - Math.PI/6),
      longitude: to.coordinate.longitude - headLength * Math.cos(angle - Math.PI/6)
    };
    
    const arrowRight = {
      latitude: to.coordinate.latitude - headLength * Math.sin(angle + Math.PI/6),
      longitude: to.coordinate.longitude - headLength * Math.cos(angle + Math.PI/6)
    };

    return (
      <>
        <Polyline
          coordinates={[from.coordinate, to.coordinate]}
          strokeColor="#FF0000"
          strokeWidth={2}
        />
        <Polyline
          coordinates={[to.coordinate, arrowLeft, to.coordinate, arrowRight]}
          strokeColor="#FF0000"
          strokeWidth={2}
        />
        <Marker coordinate={midPoint}>
          <View style={styles.distanceLabel}>
            <Text style={styles.distanceText}>{distance.toFixed(1)}m</Text>
          </View>
        </Marker>
      </>
    );
  };

  const getMarkerConnections = () => {
    const connections: JSX.Element[] = [];
    
    markers.forEach(marker => {
      if (marker.nextMarkerId) {
        const nextMarker = markers.find(m => m.id === marker.nextMarkerId);
        if (nextMarker) {
          connections.push(renderArrow(marker, nextMarker));
        }
      }
    });

    // Temporary connection if we have a selected marker and temporary marker
    if (selectedMarker && temporaryMarker) {
      const distance = calculateDistance(
        selectedMarker.coordinate.latitude, selectedMarker.coordinate.longitude,
        temporaryMarker.latitude, temporaryMarker.longitude
      );
      
      const midPoint = {
        latitude: (selectedMarker.coordinate.latitude + temporaryMarker.latitude) / 2,
        longitude: (selectedMarker.coordinate.longitude + temporaryMarker.longitude) / 2
      };

      connections.push(
        <React.Fragment key="temp-connection">
          <Polyline
            coordinates={[selectedMarker.coordinate, temporaryMarker]}
            strokeColor="#FF7043"
            strokeWidth={2}
            strokeDasharray={[5, 5]}
          />
          <Marker coordinate={midPoint}>
            <View style={styles.distanceLabel}>
              <Text style={styles.distanceText}>{distance.toFixed(1)}m</Text>
            </View>
          </Marker>
        </React.Fragment>
      );
    }

    return connections;
  };

  const stats = getMarkerStats();

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={styles.map}
          ref={mapRef}
          mapType="satellite"
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={false} // We're using our own marker
          onPress={handleMapPress}
        >
          {markers.map(marker => (
            <Marker
              key={marker.id}
              coordinate={marker.coordinate}
              pinColor={
                marker.isCurrentLocation ? '#4285F4' : 
                selectedMarker?.id === marker.id ? '#FF7043' : 
                marker.status === 'complete' ? '#4CAF50' : '#FFEB3B' // Green for complete, Yellow for incomplete
              }
              onPress={() => handleMarkerPress(marker)}
            >
              {marker.isCurrentLocation && (
                <View style={styles.currentLocationBadge}>
                  <Text style={styles.currentLocationText}>You</Text>
                </View>
              )}
            </Marker>
          ))}
          
          {temporaryMarker && (
            <Marker
              coordinate={temporaryMarker}
              pinColor="#FF7043"
            />
          )}
          
          {getMarkerConnections()}
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}

      <GooglePlacesAutocomplete
        placeholder="Search places..."
        fetchDetails={true}
        onPress={(data, details = null) => {
          if (details) {
            const { lat, lng } = details.geometry.location;
            mapRef.current?.animateToRegion({
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }
        }}
        query={{
          key: 'YOUR_GOOGLE_MAPS_API_KEY',
          language: 'en',
        }}
        styles={{
          container: {
            position: 'absolute',
            width: '90%',
            top: 10,
            alignSelf: 'center',
            zIndex: 1,
          },
          textInput: {
            backgroundColor: 'white',
            borderRadius: 20,
            paddingHorizontal: 20,
            fontSize: 16,
            shadowColor: '#000',
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          },
          listView: {
            backgroundColor: 'white',
            borderRadius: 10,
            marginTop: 10,
          },
        }}
      />

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={[styles.actionButton, styles.locationButton]}
          onPress={focusOnCurrentLocation}
        >
          <MaterialIcons name="my-location" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, editingMode ? styles.editButtonActive : styles.editButton]}
          onPress={() => {
            const newEditingMode = !editingMode;
            setEditingMode(newEditingMode);
            
            if (newEditingMode) {
              startAddingFromCurrentLocation();
            } else {
              setSelectedMarker(null);
              setTemporaryMarker(null);
            }
          }}
        >
          <FontAwesome
            name={editingMode ? 'toggle-on' : 'toggle-off'}
            size={24}
            color="white"
          />
          <Text style={styles.buttonText}>{editingMode ? 'Adding Poles' : 'Add Poles'}</Text>
        </TouchableOpacity>
      </View>

      {/* Counter area */}
      <View style={styles.counterContainer}>
        <View style={styles.counterItem}>
          <View style={styles.completedDot} />
          <Text style={styles.counterText}>Complete: {stats.completeMarkers}</Text>
        </View>
        <View style={styles.counterItem}>
          <View style={styles.incompleteDot} />
          <Text style={styles.counterText}>Incomplete: {stats.incompleteMarkers}</Text>
        </View>
      </View>

      <Modal
        visible={imageModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setImageModalVisible(false);
          setCenterImage(undefined);
          setBranchImages([]);
        }}
      >
        <View style={styles.modalContainer}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Pole Images</Text>
              
              {/* Center pole image upload */}
              <View style={styles.sectionTitle}>
                <Text style={styles.sectionTitleText}>Center Pole</Text>
              </View>
              
              <TouchableOpacity
                style={styles.centerImageButton}
                onPress={pickCenterImage}
              >
                {centerImage ? (
                  <Image
                    source={{ uri: centerImage }}
                    style={styles.imagePreview}
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={40} color="#888" />
                    <Text style={styles.imageButtonText}>Upload Center Image</Text>
                  </View>
                )}
                {centerImage && (
                  <View style={styles.checkmark}>
                    <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Branch count input */}
              <View style={styles.branchCountContainer}>
                <Text style={styles.branchCountLabel}>Number of Branches:</Text>
                <TextInput
                  style={styles.branchCountInput}
                  keyboardType="numeric"
                  value={branchCount.toString()}
                  onChangeText={handleBranchCountChange}
                  placeholder="0"
                />
              </View>

              {/* Branch images upload */}
              {branchCount > 0 && (
                <View style={styles.branchImagesContainer}>
                  <View style={styles.sectionTitle}>
                    <Text style={styles.sectionTitleText}>Branch Images</Text>
                  </View>
                  
                  {Array.from({ length: branchCount }).map((_, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.branchImageButton}
                      onPress={() => pickBranchImage(index)}
                    >
                      {branchImages[index] ? (
                        <Image
                          source={{ uri: branchImages[index] }}
                          style={styles.branchImagePreview}
                        />
                      ) : (
                        <View style={styles.branchImagePlaceholder}>
                          <Ionicons name="image-outline" size={30} color="#888" />
                          <Text style={styles.branchImageText}>Branch {index + 1}</Text>
                        </View>
                      )}
                      {branchImages[index] && (
                        <View style={styles.branchCheckmark}>
                          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setImageModalVisible(false);
                    setCenterImage(undefined);
                    setBranchImages([]);
                    setTemporaryMarker(null);
                  }}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton, 
                    styles.saveButton,
                    !centerImage && styles.saveButtonDisabled
                  ]}
                  onPress={saveMarker}
                  disabled={!centerImage}
                >
                  <Text style={styles.modalButtonText}>Save Pole</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
  },
  buttonGroup: {
    position: 'absolute',
    bottom: 80, // Adjusted to make room for counter area
    right: 20,
    zIndex: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  locationButton: {
    backgroundColor: '#4285F4',
  },
  editButton: {
    backgroundColor: '#FF7043',
    width: 'auto',
    paddingHorizontal: 15,
  },
  editButtonActive: {
    backgroundColor: '#4CAF50',
    width: 'auto',
    paddingHorizontal: 15,
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  counterContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  counterItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    marginRight: 5,
  },
  incompleteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFEB3B',
    marginRight: 5,
  },
  counterText: {
    color: 'white',
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginTop: 50,
    marginBottom: 50,
    alignSelf: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    marginTop: 10,
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
  },
  centerImageButton: {
    width: '90%',
    aspectRatio: 4/3,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageButtonText: {
    marginTop: 10,
    color: '#666',
    fontWeight: 'bold',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  checkmark: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 2,
  },
  branchCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '90%',
    marginVertical: 10,
  },
  branchCountLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
  },
  branchCountInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    padding: 10,
    width: 80,
    textAlign: 'center',
    fontSize: 16,
  },
  branchImagesContainer: {
    width: '90%',
    marginVertical: 10,
  },
  branchImageButton: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 10,
  },
  branchImagePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchImageText: {
    marginLeft: 10,
    color: '#666',
  },
  branchImagePreview: {
    width: '100%',
    height: '100%',
  },
  branchCheckmark: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 2,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
  saveButton: {
    backgroundColor: '#4285F4',
  },
  saveButtonDisabled: {
    backgroundColor: '#b3b3b3',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  currentLocationBadge: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'white',
    marginBottom: 5,
  },
  currentLocationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  distanceLabel: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF0000',
  },
  distanceText: {
    color: '#FF0000',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default MapScreen;
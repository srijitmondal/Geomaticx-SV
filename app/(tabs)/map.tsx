import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MarkerData {
  id: number;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  images: string[];
  isComplete: boolean;
}

const STORAGE_KEY = 'map_markers';
const REQUIRED_IMAGES_PER_MARKER = 3; // Number of images required for a marker to be complete

const Map = () => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState(false);
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<MarkerData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);

  // Load markers from AsyncStorage on component mount
  useEffect(() => {
    loadMarkers();
  }, []);

  // Update marker counts whenever markers change
  useEffect(() => {
    const complete = markers.filter(marker => marker.isComplete).length;
    const incomplete = markers.length - complete;
    
    setCompletedCount(complete);
    setIncompleteCount(incomplete);
  }, [markers]);

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

  const saveMarkers = async (markersToSave: MarkerData[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(markersToSave));
    } catch (error) {
      console.error('Failed to save markers to storage', error);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);

      // Zoom to max possible level at user's current location
      if (mapRef.current && currentLocation) {
        mapRef.current.animateToRegion({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.0005, // Very zoomed in (close to max possible)
          longitudeDelta: 0.0005,
        });
      }
    })();
  }, []);

  const handleMapPress = (event: any) => {
    if (!editingMode) return;

    const newMarker: MarkerData = {
      id: Date.now(), // Use timestamp for more unique IDs
      coordinate: event.nativeEvent.coordinate,
      images: [],
      isComplete: false,
    };

    const updatedMarkers = [...markers, newMarker];
    setMarkers(updatedMarkers);
    saveMarkers(updatedMarkers);
  };

  const handleMarkerPress = (marker: MarkerData) => {
    setSelectedMarker(marker);
    setModalVisible(true);
  };

  const pickImage = async () => {
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

    if (!result.canceled && result.assets && result.assets.length > 0) {
      // Update the marker with the selected image
      if (selectedMarker) {
        const updatedImages = [...selectedMarker.images, result.assets[0].uri];
        
        // Check if marker is now complete
        const isComplete = updatedImages.length >= REQUIRED_IMAGES_PER_MARKER;
        
        // Update markers array
        const updatedMarkers = markers.map(marker => 
          marker.id === selectedMarker.id 
            ? { ...marker, images: updatedImages, isComplete } 
            : marker
        );
        
        // Update state and save to storage
        setMarkers(updatedMarkers);
        saveMarkers(updatedMarkers);
        
        // Update selected marker to reflect changes
        setSelectedMarker({
          ...selectedMarker,
          images: updatedImages,
          isComplete
        });
      }
    }
  };

  const toggleEditingMode = () => {
    setEditingMode(!editingMode);
  };

  return (
    <View style={styles.container}>
      {errorMsg ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            showsUserLocation
            showsMyLocationButton
            onPress={handleMapPress}
          >
            {markers.map((marker) => (
              <Marker
                key={marker.id}
                coordinate={marker.coordinate}
                pinColor={marker.isComplete ? "green" : "yellow"}
                onPress={() => handleMarkerPress(marker)}
              />
            ))}
          </MapView>

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

          <Modal
            animationType="slide"
            transparent={true}
            visible={modalVisible}
            onRequestClose={() => setModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    Marker ID: {selectedMarker?.id}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setModalVisible(false)}
                    style={styles.closeButton}
                  >
                    <FontAwesome name="close" size={24} color="#000" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.imagesHeader}>
                  {selectedMarker?.images.length || 0}/{REQUIRED_IMAGES_PER_MARKER} Images Uploaded
                </Text>

                {/* Display uploaded images in a horizontal scroll */}
                {selectedMarker?.images.length ? (
                  <ScrollView 
                    horizontal 
                    style={styles.imageScroller}
                    contentContainerStyle={styles.imageScrollerContent}
                  >
                    {selectedMarker.images.map((uri, index) => (
                      <Image
                        key={index}
                        source={{ uri }}
                        style={styles.thumbnailImage}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.noImagesText}>No images uploaded yet</Text>
                )}

                {/* Upload button - always available if not complete */}
                {(selectedMarker?.images.length || 0) < REQUIRED_IMAGES_PER_MARKER && (
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={pickImage}
                  >
                    <FontAwesome name="camera" size={40} color="#666" />
                    <Text style={styles.uploadText}>
                      Upload Center Pole Image
                    </Text>
                  </TouchableOpacity>
                )}

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
  closeButton: {
    padding: 5,
  },
  imagesHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  imageScroller: {
    maxHeight: 120,
    marginBottom: 15,
  },
  imageScrollerContent: {
    alignItems: 'center',
    paddingHorizontal: 5,
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
  uploadButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 10,
    marginTop: 10,
  },
  uploadText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
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
});

export default Map;
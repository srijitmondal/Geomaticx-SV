// map.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, PermissionsAndroid, Platform, TouchableOpacity, Modal, Image, Alert, TextInput, ScrollView } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
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
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}

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
    bottom: 20,
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
});

export default MapScreen;
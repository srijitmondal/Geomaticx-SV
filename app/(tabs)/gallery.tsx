import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, Image, ScrollView, TouchableOpacity, Platform, Dimensions, Modal, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter, useFocusEffect } from 'expo-router';
import { Share as ShareIcon, X, MapPin, Compass, ArrowUpDown, Trash2, CircleCheck as CheckCircle2 } from 'lucide-react-native';

interface PhotoMetadata {
  timestamp: {
    utc: string;
    local: string;
  };
  location: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number;
  } | null;
  sensors: {
    compass: {
      magneticNorth: number;
      trueNorth: number | null;
    };
    orientation: {
      pitch: number;
      roll: number;
      yaw: number;
    };
  } | null;
}

interface Photo {
  uri: string;
  metadata: PhotoMetadata | null;
}

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;
const imageSize = (windowWidth - 48) / 2; // 2 columns with padding

export default function GalleryScreen() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const router = useRouter();

  const loadPhotos = async () => {
    try {
      if (Platform.OS === 'web') {
        setError('Gallery features are not available on web');
        setLoading(false);
        return;
      }

      const photosDir = `${FileSystem.documentDirectory}photos/`;
      
      const dirInfo = await FileSystem.getInfoAsync(photosDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true });
        setPhotos([]);
        setLoading(false);
        return;
      }

      const files = await FileSystem.readDirectoryAsync(photosDir);
      const imageFiles = files.filter(file => file.match(/\.(jpg|jpeg|png)$/i));
      
      const photoData = await Promise.all(
        imageFiles.map(async (filename) => {
          const uri = `${photosDir}${filename}`;
          let metadata = null;

          try {
            const metadataFile = `${uri}.json`;
            const metadataInfo = await FileSystem.getInfoAsync(metadataFile);
            
            if (metadataInfo.exists) {
              const metadataContent = await FileSystem.readAsStringAsync(metadataFile);
              metadata = JSON.parse(metadataContent);
            }
          } catch (err) {
            console.warn(`Failed to load metadata for ${filename}:`, err);
          }

          return { uri, metadata };
        })
      );

      const sortedPhotos = photoData.sort((a, b) => {
        const timeA = a.metadata?.timestamp.utc ? new Date(a.metadata.timestamp.utc).getTime() : 0;
        const timeB = b.metadata?.timestamp.utc ? new Date(b.metadata.timestamp.utc).getTime() : 0;
        return timeB - timeA;
      });

      setPhotos(sortedPhotos);
    } catch (err) {
      setError('Failed to load photos');
      console.error('Error loading photos:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [])
  );

  const handleShare = async (photo: Photo) => {
    try {
      if (Platform.OS === 'web') return;

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        alert('Sharing is not available on this device');
        return;
      }

      await Sharing.shareAsync(photo.uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share Photo',
      });
    } catch (error) {
      console.error('Error sharing:', error);
      alert('Failed to share photo');
    }
  };

  const handleBatchShare = async () => {
    try {
      if (Platform.OS === 'web' || selectedPhotos.size === 0) return;

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        alert('Sharing is not available on this device');
        return;
      }

      // Create a temporary zip file containing selected photos and their metadata
      const zipDir = `${FileSystem.cacheDirectory}selected_photos/`;
      await FileSystem.makeDirectoryAsync(zipDir, { intermediates: true });

      // Copy selected photos and their metadata to the temp directory
      const selectedPhotosList = photos.filter(photo => selectedPhotos.has(photo.uri));
      await Promise.all(
        selectedPhotosList.map(async (photo) => {
          const filename = photo.uri.split('/').pop();
          if (!filename) return;

          await FileSystem.copyAsync({
            from: photo.uri,
            to: `${zipDir}${filename}`,
          });

          if (photo.metadata) {
            await FileSystem.writeAsStringAsync(
              `${zipDir}${filename}.json`,
              JSON.stringify(photo.metadata, null, 2)
            );
          }
        })
      );

      // Share the directory
      await Sharing.shareAsync(zipDir, {
        mimeType: 'application/zip',
        dialogTitle: 'Share Photos',
      });

      // Clean up
      await FileSystem.deleteAsync(zipDir, { idempotent: true });
      
      // Exit selection mode
      setSelectionMode(false);
      setSelectedPhotos(new Set());
    } catch (error) {
      console.error('Error sharing multiple photos:', error);
      alert('Failed to share photos');
    }
  };

  const handleDeleteSelected = async () => {
    try {
      if (selectedPhotos.size === 0) return;

      Alert.alert(
        'Delete Photos',
        `Delete ${selectedPhotos.size} selected photos?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await Promise.all(
                  Array.from(selectedPhotos).map(async (uri) => {
                    try {
                      await FileSystem.deleteAsync(uri);
                      // Also delete metadata file if it exists
                      const metadataUri = `${uri}.json`;
                      await FileSystem.deleteAsync(metadataUri, { idempotent: true });
                    } catch (err) {
                      console.warn(`Failed to delete ${uri}:`, err);
                    }
                  })
                );

                // Refresh the gallery
                await loadPhotos();
                
                // Exit selection mode
                setSelectionMode(false);
                setSelectedPhotos(new Set());
              } catch (error) {
                console.error('Error deleting photos:', error);
                Alert.alert('Error', 'Failed to delete some photos');
              }
            },
          },
        ],
        { cancelable: true }
      );
    } catch (error) {
      console.error('Error deleting photos:', error);
      Alert.alert('Error', 'Failed to delete photos');
    }
  };

  const togglePhotoSelection = (photo: Photo) => {
    setSelectedPhotos(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(photo.uri)) {
        newSelection.delete(photo.uri);
        if (newSelection.size === 0) {
          setSelectionMode(false);
        }
      } else {
        newSelection.add(photo.uri);
      }
      return newSelection;
    });
  };

  const handlePhotoPress = (photo: Photo) => {
    if (selectionMode) {
      togglePhotoSelection(photo);
    } else {
      setSelectedPhoto(photo);
    }
  };

  const handlePhotoLongPress = (photo: Photo) => {
    if (!selectionMode) {
      setSelectionMode(true);
    }
    togglePhotoSelection(photo);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.webMessage}>
          Gallery features are not available on web. Please use a mobile device.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading photos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No photos yet</Text>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={() => router.push('/')}
        >
          <Text style={styles.captureButtonText}>Take a Photo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      {selectionMode && (
        <View style={styles.selectionHeader}>
          <TouchableOpacity
            style={styles.selectionButton}
            onPress={() => {
              setSelectionMode(false);
              setSelectedPhotos(new Set());
            }}>
            <X color="#fff" size={24} />
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
            {selectedPhotos.size} selected
          </Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={styles.selectionButton}
              onPress={handleBatchShare}>
              <ShareIcon color="#fff" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionButton, styles.deleteButton]}
              onPress={handleDeleteSelected}>
              <Trash2 color="#fff" size={24} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.grid}>
          {photos.map((photo, index) => (
            <TouchableOpacity
              key={photo.uri}
              style={[
                styles.imageContainer,
                selectedPhotos.has(photo.uri) && styles.selectedImageContainer
              ]}
              onPress={() => handlePhotoPress(photo)}
              onLongPress={() => handlePhotoLongPress(photo)}
              delayLongPress={200}
            >
              <Image source={{ uri: photo.uri }} style={styles.image} />
              {selectedPhotos.has(photo.uri) && (
                <View style={styles.checkmarkOverlay}>
                  <CheckCircle2 color="#60a5fa" size={24} />
                </View>
              )}
              {photo.metadata?.location && (
                <View style={styles.metadataOverlay}>
                  <Text style={styles.metadataText}>
                    {photo.metadata.location.latitude.toFixed(6)}°, {photo.metadata.location.longitude.toFixed(6)}°
                  </Text>
                  {photo.metadata.location.altitude && (
                    <Text style={styles.metadataText}>
                      {photo.metadata.location.altitude.toFixed(1)}m
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={selectedPhoto !== null}
        animationType="slide"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setSelectedPhoto(null)}
              style={styles.modalButton}
            >
              <X color="#fff" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => selectedPhoto && handleShare(selectedPhoto)}
              style={styles.modalButton}
            >
              <ShareIcon color="#fff" size={24} />
            </TouchableOpacity>
          </View>

          {selectedPhoto && (
            <ScrollView style={styles.modalContent}>
              <Image
                source={{ uri: selectedPhoto.uri }}
                style={styles.modalImage}
                resizeMode="contain"
              />

              {selectedPhoto.metadata && (
                <View style={styles.detailsContainer}>
                  <Text style={styles.detailsTitle}>Photo Details</Text>
                  
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsLabel}>
                      Captured: {formatDate(selectedPhoto.metadata.timestamp.local)}
                    </Text>
                  </View>

                  {selectedPhoto.metadata.location && (
                    <View style={styles.detailsSection}>
                      <View style={styles.detailsHeader}>
                        <MapPin color="#60a5fa" size={20} />
                        <Text style={styles.detailsSubtitle}>Location</Text>
                      </View>
                      <Text style={styles.detailsText}>
                        Latitude: {selectedPhoto.metadata.location.latitude.toFixed(6)}°
                      </Text>
                      <Text style={styles.detailsText}>
                        Longitude: {selectedPhoto.metadata.location.longitude.toFixed(6)}°
                      </Text>
                      {selectedPhoto.metadata.location.altitude && (
                        <Text style={styles.detailsText}>
                          Altitude: {selectedPhoto.metadata.location.altitude.toFixed(1)}m
                        </Text>
                      )}
                      <Text style={styles.detailsText}>
                        Accuracy: ±{selectedPhoto.metadata.location.accuracy.toFixed(1)}m
                      </Text>
                    </View>
                  )}

                  {selectedPhoto.metadata.sensors && (
                    <View style={styles.detailsSection}>
                      <View style={styles.detailsHeader}>
                        <Compass color="#60a5fa" size={20} />
                        <Text style={styles.detailsSubtitle}>Orientation</Text>
                      </View>
                      <Text style={styles.detailsText}>
                        Magnetic North: {selectedPhoto.metadata.sensors.compass.magneticNorth.toFixed(1)}°
                      </Text>
                      <View style={styles.detailsHeader}>
                        <ArrowUpDown color="#60a5fa" size={20} />
                        <Text style={styles.detailsSubtitle}>Device Orientation</Text>
                      </View>
                      <Text style={styles.detailsText}>
                        Pitch: {selectedPhoto.metadata.sensors.orientation.pitch.toFixed(1)}°
                      </Text>
                      <Text style={styles.detailsText}>
                        Roll: {selectedPhoto.metadata.sensors.orientation.roll.toFixed(1)}°
                      </Text>
                      <Text style={styles.detailsText}>
                        Yaw: {selectedPhoto.metadata.sensors.orientation.yaw.toFixed(1)}°
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1b1e',
  },
  contentContainer: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  imageContainer: {
    width: imageSize,
    height: imageSize,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2c2d31',
  },
  selectedImageContainer: {
    borderWidth: 2,
    borderColor: '#60a5fa',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  checkmarkOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: 2,
  },
  metadataOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
  },
  metadataText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  loadingText: {
    color: '#60a5fa',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  webMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  captureButton: {
    backgroundColor: '#60a5fa',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    alignSelf: 'center',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2c2d31',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  selectionCount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1b1e',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#2c2d31',
  },
  modalButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
  },
  modalImage: {
    width: windowWidth,
    height: windowWidth,
    backgroundColor: '#2c2d31',
  },
  detailsContainer: {
    padding: 16,
  },
  detailsTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  detailsSection: {
    backgroundColor: '#2c2d31',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailsSubtitle: {
    color: '#60a5fa',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  detailsLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  detailsText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
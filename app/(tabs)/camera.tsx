// app/(tabs)/index.tsx
import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Modal, ActivityIndicator } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Camera as CameraIcon, Crosshair, Check, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

interface SensorData {
  compass: number;
  pitch: number;
  roll: number;
}

interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
}

export interface CapturedImageData {
  uri: string;
  metadata: {
    location: LocationData;
    orientation: SensorData;
    timestamp: number;
  };
}

export default function CameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [sensorData, setSensorData] = useState<SensorData>({
    compass: 0,
    pitch: 0,
    roll: 0,
  });
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<CapturedImageData | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();
  const params = useLocalSearchParams();

  // Get parameters from navigation
  const markerId = params.markerId as string | undefined;
  const markerType = params.markerType as 'center' | 'branch' | undefined;
  const branchIndex = params.branchIndex ? parseInt(params.branchIndex as string) : undefined;
  const returnToModal = params.returnToModal === 'true';

  useEffect(() => {
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }

    const initialize = async () => {
      // Request camera permissions
      if (!permission?.granted) {
        await requestPermission();
      }

      // Request media permissions
      if (!mediaPermission?.granted) {
        await requestMediaPermission();
      }

      // Request location permissions
      if (!locationPermission?.granted) {
        await requestLocationPermission();
      }

      setLoading(false);
    };

    initialize();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || loading) {
      return;
    }

    const subscribeToSensors = async () => {
      Accelerometer.setUpdateInterval(100);
      Magnetometer.setUpdateInterval(100);

      const accelerometerSubscription = Accelerometer.addListener(data => {
        const pitch = Math.atan2(-data.x, Math.sqrt(data.y * data.y + data.z * data.z)) * (180 / Math.PI);
        const roll = Math.atan2(data.y, data.z) * (180 / Math.PI);
        setSensorData(prev => ({ ...prev, pitch, roll }));
      });

      const magnetometerSubscription = Magnetometer.addListener(data => {
        const heading = Math.atan2(data.y, data.x) * (180 / Math.PI);
        setSensorData(prev => ({ ...prev, compass: heading }));
      });

      return () => {
        accelerometerSubscription.remove();
        magnetometerSubscription.remove();
      };
    };

    subscribeToSensors();
  }, [loading]);

  useEffect(() => {
    if (Platform.OS === 'web' || loading) {
      return;
    }

    const getLocation = async () => {
      if (!locationPermission?.granted) {
        const permission = await requestLocationPermission();
        if (!permission.granted) return;
      }

      await Location.enableNetworkProviderAsync();
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
      });

      setLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude,
        accuracy: location.coords.accuracy,
      });
    };

    const locationSubscription = Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0.1,
      },
      location => {
        setLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude,
          accuracy: location.coords.accuracy,
        });
      }
    );

    getLocation();

    return () => {
      locationSubscription.then(sub => sub.remove());
    };
  }, [loading, locationPermission]);

  const handleCapture = async () => {
    if (Platform.OS === 'web' || capturing || !cameraRef.current) return;

    try {
      setCapturing(true);
      setError(null);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        exif: true,
        skipProcessing: false,
      });

      if (photo && location && sensorData) {
        const imageData: CapturedImageData = {
          uri: photo.uri,
          metadata: {
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
              altitude: location.altitude,
              accuracy: location.accuracy,
            },
            orientation: {
              compass: sensorData.compass,
              pitch: sensorData.pitch,
              roll: sensorData.roll,
            },
            timestamp: Date.now(),
          }
        };
        
        setCapturedImage(imageData);
        setShowConfirmModal(true);
      }
    } catch (error) {
      setError('Failed to capture image');
      console.error('Capture error:', error);
    } finally {
      setCapturing(false);
    }
  };

  const saveToGallery = async (uri: string) => {
    try {
      if (mediaPermission?.granted) {
        await MediaLibrary.saveToLibraryAsync(uri);
        console.log('Saved to gallery');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error saving to gallery:', error);
      return false;
    }
  };

  const handleConfirm = async () => {
    if (!capturedImage) return;
    
    try {
      // Save to gallery
      await saveToGallery(capturedImage.uri);
      
      // Navigate back with the captured image data
      router.push({
        pathname: '/map',
        params: {
          capturedImage: JSON.stringify(capturedImage),
          markerId,
          markerType,
          branchIndex: branchIndex?.toString(),
          returnToModal: returnToModal ? 'true' : 'false',
          // Pass back any other state we received
          ...params
        }
      });
    } catch (error) {
      console.error("Error in handleConfirm:", error);
      router.push('/map');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setShowConfirmModal(false);
  };

  const toggleCameraFacing = () => {
    setFacing(prev => prev === 'back' ? 'front' : 'back');
  };

  const handleCancel = () => {
    router.push('/map');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.loadingText}>Initializing camera...</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.webMessage}>
          Camera features are not available on web. Please use a mobile device.
        </Text>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView 
        ref={cameraRef}
        style={styles.camera} 
        type={facing}
      >
        <View style={styles.overlay}>
          <Crosshair color="#60a5fa" size={48} />
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              Heading: {sensorData.compass.toFixed(1)}°
            </Text>
            <Text style={styles.infoText}>
              Pitch: {sensorData.pitch.toFixed(1)}°
            </Text>
            <Text style={styles.infoText}>
              Roll: {sensorData.roll.toFixed(1)}°
            </Text>
            {location && (
              <>
                <Text style={styles.infoText}>
                  Lat: {location.latitude.toFixed(6)}
                </Text>
                <Text style={styles.infoText}>
                  Lon: {location.longitude.toFixed(6)}
                </Text>
                <Text style={styles.infoText}>
                  Alt: {location.altitude?.toFixed(1)}m
                </Text>
                <Text style={styles.infoText}>
                  Accuracy: ±{location.accuracy.toFixed(1)}m
                </Text>
              </>
            )}
          </View>

          {/* Purpose indicator */}
          {markerType && (
            <View style={styles.purposeContainer}>
              <Text style={styles.purposeText}>
                {markerType === 'center' ? 'Center Pole Image' : 
                 markerType === 'branch' ? `Branch ${branchIndex !== undefined ? branchIndex + 1 : ''} Image` : 
                 'Capture Image'}
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.controlsContainer}>
            <TouchableOpacity 
              style={styles.flipButton}
              onPress={toggleCameraFacing}
            >
              <CameraIcon style={{ transform: [{ rotate: '180deg' }] }} color="#fff" size={24} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.captureButton,
                capturing && styles.captureButtonDisabled
              ]} 
              onPress={handleCapture}
              disabled={capturing}
            >
              <CameraIcon color="#fff" size={32} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleCancel}
            >
              <Text style={styles.backButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
      
      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.confirmModalContainer}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Save Image?</Text>
            
            <View style={styles.confirmButtonContainer}>
              <TouchableOpacity 
                style={[styles.confirmButton, styles.retakeButton]} 
                onPress={handleRetake}
              >
                <X color="#fff" size={20} />
                <Text style={styles.confirmButtonText}>Retake</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmButton, styles.doneButton]} 
                onPress={handleConfirm}
              >
                <Check color="#fff" size={20} />
                <Text style={styles.confirmButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1b1e',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 20,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
  },
  infoText: {
    color: '#fff',
    fontSize: 14,
    marginVertical: 2,
    fontFamily: 'monospace',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  captureButton: {
    backgroundColor: '#60a5fa',
    borderRadius: 40,
    padding: 20,
  },
  captureButtonDisabled: {
    backgroundColor: '#60a5fa80',
  },
  flipButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 30,
    padding: 15,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 5,
    padding: 15,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  errorContainer: {
    position: 'absolute',
    bottom: 120,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  purposeContainer: {
    position: 'absolute',
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
  },
  purposeText: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  webMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  message: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#60a5fa',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  confirmModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  confirmModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 15,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  confirmModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  confirmButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
  },
  retakeButton: {
    backgroundColor: '#ef4444',
  },
  doneButton: {
    backgroundColor: '#22c55e',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Modal } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Camera as CameraIcon, Crosshair, Check, X } from 'lucide-react-native';
import { captureImageWithMetadata, ImageCaptureError } from '@/utils/imageCapture';
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

// New interface for captured image data to share with MapScreen
export interface CapturedImageData {
  uri: string;
  metadata: {
    location: LocationData;
    orientation: SensorData;
    timestamp: number;
  };
}

export default function SurveyScreen({ route, navigation }: any) {
  const cameraRef = useRef(null);
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
  
  // Extract parameters from route if available
  const markerId = route?.params?.markerId;
  const markerType = route?.params?.markerType; // 'center' or 'branch'
  const branchIndex = route?.params?.branchIndex;
  const returnToModal = route?.params?.returnToModal === 'true';

  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Same sensor and location setup as before...
  
  useEffect(() => {
    if (Platform.OS === 'web') {
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
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const getLocation = async () => {
      if (!locationPermission?.granted) {
        const permission = await requestLocationPermission();
        if (!permission.granted) return;
      }

      // Configure for highest accuracy
      await Location.enableNetworkProviderAsync();
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true, // Prompt user to enable high accuracy mode
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
        distanceInterval: 0.1, // Update every 0.1 meters for higher precision
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
  }, [locationPermission]);

  // Request media library permission if needed
  useEffect(() => {
    if (!mediaPermission?.granted) {
      requestMediaPermission();
    }
  }, [mediaPermission]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.webMessage}>
          Camera and sensor features are not available on web. Please use a mobile device.
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

  const handleCapture = async () => {
    if (Platform.OS === 'web' || capturing) return;

    try {
      setCapturing(true);
      setError(null);

      const result = await captureImageWithMetadata(cameraRef);
      console.log('Photo captured successfully:', result.uri);
      
      if (result && location && sensorData) {
        // Create a standardized object with image and metadata
        const imageData: CapturedImageData = {
          uri: result.uri,
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
        
        // Store the captured image and show the confirmation modal
        setCapturedImage(imageData);
        setShowConfirmModal(true);
      }
      
    } catch (error) {
      if (error instanceof ImageCaptureError) {
        setError(error.message);
      } else {
        setError('Failed to capture image');
      }
      console.error('Capture error:', error);
    } finally {
      setCapturing(false);
    }
  };

  const saveToGallery = async (uri: string) => {
    try {
      if (mediaPermission?.granted) {
        const asset = await MediaLibrary.createAssetAsync(uri);
        await MediaLibrary.createAlbumAsync('SurveyPoles', asset, false);
        console.log('Saved to gallery');
        return true;
      } else {
        console.log('No permission to save to gallery');
        return false;
      }
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
    
    // Close modal
    setShowConfirmModal(false);
    
    // Extract route parameters for return navigation
    const routeParams = route?.params || {};
    
    // Get params from incoming navigation if possible
    const tempMarkerLat = routeParams.tempMarkerLat;
    const tempMarkerLng = routeParams.tempMarkerLng;
    const branchCount = routeParams.branchCount;
    const branchImagesState = routeParams.branchImagesState;
    const centerImageState = routeParams.centerImageState;
    
    console.log("Sending image back to map:", capturedImage.uri);
    
    // Navigate back to map with the captured image and preserved state
    router.push({
      pathname: '/map',
      params: {
        // The key issue: stringify the entire capturedImage object properly
        capturedImage: JSON.stringify(capturedImage),
        markerId: markerId || routeParams.markerId,
        markerType: markerType || routeParams.markerType,
        branchIndex: branchIndex !== undefined ? branchIndex : routeParams.branchIndex,
        returnToModal: returnToModal || routeParams.returnToModal ? 'true' : 'false',
        // Pass back all the state we received
        tempMarkerLat,
        tempMarkerLng,
        branchCount,
        branchImagesState,
        centerImageState
      }
    });
  } catch (error) {
    console.error("Error in handleConfirm:", error);
    // Proceed with navigation anyway to avoid getting stuck
    router.push('/map');
  }
};

  const handleRetake = () => {
    // Clear captured image and close modal
    setCapturedImage(null);
    setShowConfirmModal(false);
  };

  const toggleCameraFacing = () => {
    setFacing(prev => prev === 'back' ? 'front' : 'back');
  };

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
          {markerId && (
            <View style={styles.purposeContainer}>
              <Text style={styles.purposeText}>
                {markerType === 'center' ? 'Center Pole Image' : 
                 markerType === 'branch' ? `Branch ${branchIndex + 1} Image` : 
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
              onPress={() => navigation?.goBack()}
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
  // Confirmation modal styles
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
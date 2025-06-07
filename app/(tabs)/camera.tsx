import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Accelerometer, DeviceMotion } from 'expo-sensors';
import { Camera as CameraIcon, Crosshair } from 'lucide-react-native';
import { captureImageWithMetadata, ImageCaptureError } from '@/utils/imageCapture';

// Define types for better integration
export interface SensorData {
  compass: number;
  pitch: number;
  roll: number;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
}

export interface CaptureResult {
  uri: string;
  location: LocationData | null;
  sensorData: SensorData;
  timestamp: number;
}

// Define a ref type for external control
export interface CameraRef {
  capture: () => Promise<CaptureResult>;
  getCurrentLocation: () => LocationData | null;
  getCurrentSensorData: () => SensorData;
}

interface CameraProps {
  onCapture?: (result: CaptureResult) => void;
  onLocationUpdate?: (location: LocationData) => void;
  onError?: (error: string) => void;
  initialLocation?: LocationData;
  showOverlay?: boolean;
}

export const SurveyCameraView = forwardRef<CameraRef, CameraProps>(
  ({ onCapture, onLocationUpdate, onError, initialLocation, showOverlay = true }, ref) => {
    const cameraRef = useRef(null);
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
    const [sensorData, setSensorData] = useState<SensorData>({
      compass: 0,
      pitch: 0,
      roll: 0,
    });
    const [location, setLocation] = useState<LocationData | null>(initialLocation || null);
    const [error, setError] = useState<string | null>(null);
    const [capturing, setCapturing] = useState(false);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      capture: async () => {
        return handleCapture();
      },
      getCurrentLocation: () => location,
      getCurrentSensorData: () => sensorData,
    }));

    useEffect(() => {
      if (Platform.OS === 'web') {
        return;
      }

      const subscribeToSensors = async () => {
        Accelerometer.setUpdateInterval(100);
        DeviceMotion.setUpdateInterval(100);

        const accelerometerSubscription = Accelerometer.addListener(data => {
          const pitch = Math.atan2(-data.x, Math.sqrt(data.y * data.y + data.z * data.z)) * (180 / Math.PI);
          const roll = Math.atan2(data.y, data.z) * (180 / Math.PI);
          setSensorData(prev => ({ ...prev, pitch, roll }));
        });

        const motionSubscription = DeviceMotion.addListener(data => {
          if (!data.rotation) return;

          // Get the device orientation
          const { alpha, beta, gamma } = data.rotation;
          
          // Convert to degrees
          const alphaDeg = (alpha || 0) * (180 / Math.PI);
          const betaDeg = (beta || 0) * (180 / Math.PI);
          const gammaDeg = (gamma || 0) * (180 / Math.PI);

          // Calculate heading based on device orientation
          let newHeading = alphaDeg;
          
          // Adjust heading based on device tilt
          if (Math.abs(betaDeg) > 45 || Math.abs(gammaDeg) > 45) {
            // Device is tilted too much, use last valid heading
            newHeading = sensorData.compass;
          } else {
            // Normalize heading to 0-360
            newHeading = ((newHeading % 360) + 360) % 360;
          }

          setSensorData(prev => ({ ...prev, compass: newHeading }));
        });

        return () => {
          accelerometerSubscription.remove();
          motionSubscription.remove();
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

        const locationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude,
          accuracy: location.coords.accuracy ?? 0,
        };

        setLocation(locationData);
        if (onLocationUpdate) onLocationUpdate(locationData);
      };

      const locationSubscription = Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0.1, // Update every 0.1 meters for higher precision
        },
        location => {
          const locationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            altitude: location.coords.altitude,
            accuracy: location.coords.accuracy ?? 0,
          };
          
          setLocation(locationData);
          if (onLocationUpdate) onLocationUpdate(locationData);
        }
      );

      getLocation();

      return () => {
        locationSubscription.then(sub => sub.remove());
      };
    }, [locationPermission, onLocationUpdate]);

    const handleCapture = async (): Promise<CaptureResult> => {
      if (Platform.OS === 'web' || capturing) {
        throw new Error('Cannot capture on web or while already capturing');
      }

      try {
        setCapturing(true);
        setError(null);

        const result = await captureImageWithMetadata(cameraRef);
        
        const captureResult = {
          uri: result.uri,
          location,
          sensorData,
          timestamp: Date.now(),
        };
        
        if (onCapture) onCapture(captureResult);
        return captureResult;
        
      } catch (error) {
        const errorMessage = error instanceof ImageCaptureError 
          ? error.message 
          : 'Failed to capture image';
        
        setError(errorMessage);
        if (onError) onError(errorMessage);
        console.error('Capture error:', error);
        throw error;
      } finally {
        setCapturing(false);
      }
    };

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

    return (
      <View style={styles.container}>
        <CameraView 
          ref={cameraRef}
          style={styles.camera}
        >
          {showOverlay && (
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

              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity 
                style={[
                  styles.captureButton,
                  capturing && styles.captureButtonDisabled
                ]} 
                onPress={() => handleCapture()}
                disabled={capturing}
              >
                <CameraIcon color="#fff" size={32} />
              </TouchableOpacity>
            </View>
          )}
        </CameraView>
      </View>
    );
  }
);

// Create a hook to use location and sensor data separately
export function useSurveyLocationData() {
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [location, setLocation] = useState<LocationData | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

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
        accuracy: location.coords.accuracy ?? 0,
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
          accuracy: location.coords.accuracy ?? 0,
        });
      }
    );

    getLocation();

    return () => {
      locationSubscription.then(sub => sub.remove());
    };
  }, [locationPermission]);

  return {
    location,
    requestLocationPermission,
    hasPermission: !!locationPermission?.granted
  };
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
  captureButton: {
    position: 'absolute',
    bottom: 40,
    backgroundColor: '#60a5fa',
    borderRadius: 40,
    padding: 20,
  },
  captureButtonDisabled: {
    backgroundColor: '#60a5fa80',
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
});
export default SurveyCameraView;
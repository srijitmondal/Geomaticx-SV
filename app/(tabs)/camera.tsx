import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Animated } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Accelerometer, DeviceMotion, Magnetometer } from 'expo-sensors';
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

// Shared state for calibrated compass heading
let calibratedHeading = 0;
let isCalibrated = false;

export const setCalibratedHeading = (heading: number) => {
  calibratedHeading = heading;
  isCalibrated = true;
};

export const getCalibratedHeading = () => ({
  heading: calibratedHeading,
  isCalibrated
});

interface CameraProps {
  onCapture?: (result: CaptureResult) => void;
  onLocationUpdate?: (location: LocationData) => void;
  onError?: (error: string) => void;
  initialLocation?: LocationData;
  showOverlay?: boolean;
}

// Add GridLines component before the SurveyCameraView
const GridLines = () => {
  return (
    <View style={styles.gridContainer}>
      {/* Vertical lines */}
      <View style={[styles.gridLine, styles.verticalLine1]} />
      <View style={[styles.gridLine, styles.verticalLine2]} />
      {/* Horizontal lines */}
      <View style={[styles.gridLine, styles.horizontalLine1]} />
      <View style={[styles.gridLine, styles.horizontalLine2]} />
    </View>
  );
};

// Add CompassArrow component before the SurveyCameraView
const CompassArrow = () => {
  return (
    <View style={[styles.arrowContainer, { transform: [{ rotate: '0deg' }] }]}>
      <View style={styles.arrowHead} />
      <View style={styles.arrowBody} />
    </View>
  );
};

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
    const prevHeadingref = useRef<number>(0);
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

      // accelerometer for pitch and roll
      Accelerometer.setUpdateInterval(100);
      const accelerometerSubscription = Accelerometer.addListener(data => {
        const pitch = Math.atan2(-data.x, Math.sqrt(data.y * data.y + data.z * data.z)) * (180 / Math.PI);
        const roll = Math.atan2(data.y, data.z) * (180 / Math.PI);
        setSensorData(prev => ({ ...prev, pitch, roll }));
      });

      // compass heading
      let headingSubscription: Location.LocationSubscription | undefined;
      const startHeadingUpdates = async () => {
        if (!locationPermission?.granted) {
          // It will be requested in another effect, but we can wait.
          return;
        }
        
        try {
          headingSubscription = await Location.watchHeadingAsync(heading => {
            let newHeading = heading.trueHeading > -1 ? heading.trueHeading : heading.magHeading;
            
            if (isCalibrated) {
              newHeading = calibratedHeading; // allow override
            }
            
            newHeading = ((newHeading % 360) + 360) % 360; // normalize
            setSensorData(prev => ({ ...prev, compass: newHeading }));
          });
        } catch (e) {
          console.error("Failed to start heading updates:", e);
          setError("Could not get heading updates.");
        }
      };
      startHeadingUpdates();

      return () => {
        accelerometerSubscription?.remove();
        headingSubscription?.remove();
      };
    }, [locationPermission]);

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
              <GridLines />
              <CompassArrow />
              
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
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  verticalLine1: {
    width: 1,
    height: '100%',
    left: '33.33%',
  },
  verticalLine2: {
    width: 1,
    height: '100%',
    left: '66.66%',
  },
  horizontalLine1: {
    width: '100%',
    height: 1,
    top: '33.33%',
  },
  horizontalLine2: {
    width: '100%',
    height: 1,
    top: '66.66%',
  },
  arrowContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowHead: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 30,
    borderRightWidth: 30,
    borderBottomWidth: 60,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255, 0, 0, 0.7)',
    transform: [{ translateY: -10 }],
  },
  arrowBody: {
    width: 8,
    height: 40,
    backgroundColor: 'rgba(255, 0, 0, 0.7)',
    transform: [{ translateY: -10 }],
  },
});
export default SurveyCameraView;
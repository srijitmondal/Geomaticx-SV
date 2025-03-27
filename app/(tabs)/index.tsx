import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Camera as CameraIcon, Crosshair } from 'lucide-react-native';
import { captureImageWithMetadata, ImageCaptureError } from '@/utils/imageCapture';

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

export default function SurveyScreen() {
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [sensorData, setSensorData] = useState<SensorData>({
    compass: 0,
    pitch: 0,
    roll: 0,
  });
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

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

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
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
        distanceInterval: 1,
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
        <Text style={styles.message}>We need camera permission to continue</Text>
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
      
      // You could show a success message or preview the image here
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
            onPress={handleCapture}
            disabled={capturing}
          >
            <CameraIcon color="#fff" size={32} />
          </TouchableOpacity>
        </View>
      </CameraView>
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
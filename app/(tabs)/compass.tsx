import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Platform, Animated, Alert, TouchableOpacity } from 'react-native';
import { Magnetometer, Accelerometer } from 'expo-sensors';
import { Compass } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

// Kalman Filter implementation for heading with adjusted parameters
class KalmanFilter {
  public R: number; // Measurement noise
  public Q: number; // Process noise
  private P: number; // Error covariance
  private x: number; // State estimate
  private K: number; // Kalman gain

  constructor(R = 0.05, Q = 0.01) { // Adjusted parameters for better responsiveness
    this.R = R;
    this.Q = Q;
    this.P = 1;
    this.x = 0;
    this.K = 0;
  }

  update(measurement: number): number {
    // Prediction
    this.P = this.P + this.Q;

    // Update
    this.K = this.P / (this.P + this.R);
    this.x = this.x + this.K * (measurement - this.x);
    this.P = (1 - this.K) * this.P;

    return this.x;
  }

  reset() {
    this.P = 1;
    this.x = 0;
    this.K = 0;
  }
}

export default function CompassScreen() {
  const [heading, setHeading] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [magneticInterference, setMagneticInterference] = useState(false);
  const [magneticDeclination, setMagneticDeclination] = useState(0);
  const calibrationAnimation = useRef(new Animated.Value(0)).current;
  const lastHeading = useRef(0);
  const calibrationPoints = useRef<number[]>([]);
  const lastCalibrationTime = useRef<number>(0);
  const kalmanFilter = useRef(new KalmanFilter(0.05, 0.01)).current;
  const figure8Points = useRef<{x: number, y: number}[]>([]);
  const lastFigure8Time = useRef<number>(0);
  const initialCalibrationDone = useRef(false);

  // Earth's magnetic field range in microteslas (µT)
  const EARTH_MAGNETIC_FIELD_RANGE = { min: 25, max: 65 };
  const CALIBRATION_POINTS_NEEDED = 16; // Increased for better accuracy
  const FIGURE8_POINTS_NEEDED = 20;

  // Get magnetic declination based on location
  const getMagneticDeclination = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Calculate magnetic declination using the World Magnetic Model
      // This is a simplified calculation - for production, use a proper WMM library
      const declination = calculateMagneticDeclination(latitude, longitude);
      setMagneticDeclination(declination);
    } catch (error) {
      console.log('Error getting location:', error);
    }
  };

  // Simplified magnetic declination calculation
  const calculateMagneticDeclination = (latitude: number, longitude: number) => {
    // This is a very simplified calculation
    // For production, use a proper World Magnetic Model library
    const year = new Date().getFullYear();
    const yearFraction = year + (new Date().getMonth() / 12);
    
    // Basic calculation (this is simplified - use a proper WMM library for production)
    const declination = (longitude * 0.1) + (latitude * 0.05);
    return declination;
  };

  // Check for magnetic interference with improved accuracy
  const checkMagneticInterference = (x: number, y: number, z: number) => {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const inRange = magnitude >= EARTH_MAGNETIC_FIELD_RANGE.min && 
                    magnitude <= EARTH_MAGNETIC_FIELD_RANGE.max;
    
    // Additional check for sudden changes
    const suddenChange = Math.abs(magnitude - lastMagnitude.current) > 10;
    lastMagnitude.current = magnitude;
    
    setMagneticInterference(!inRange || suddenChange);
    return inRange && !suddenChange;
  };

  const lastMagnitude = useRef(0);

  // Enhanced tilt compensation specifically for vertical (portrait) orientation
  const calculateHeading = (
    magnetometer: { x: number; y: number; z: number },
    accelerometer: { x: number; y: number; z: number }
  ) => {
    try {
      // Normalize accelerometer data
      const accelNorm = Math.sqrt(
        accelerometer.x * accelerometer.x +
        accelerometer.y * accelerometer.y +
        accelerometer.z * accelerometer.z
      );
      
      if (accelNorm === 0) return lastHeading.current;
      
      const ax = accelerometer.x / accelNorm;
      const ay = accelerometer.y / accelNorm;
      const az = accelerometer.z / accelNorm;

      // For vertical orientation (portrait mode), we need to adjust the calculations
      // Detect if device is in portrait mode (vertical)
      const isPortrait = Math.abs(az) > 0.7; // Device is mostly vertical

      let calculatedHeading: number;

      if (isPortrait) {
        // Special handling for vertical orientation
        // In portrait mode, we use the x and y components of the magnetometer
        // and adjust for the device's tilt
        const mx = magnetometer.x;
        const my = magnetometer.y;
        
        // Calculate the heading directly from the horizontal components
        calculatedHeading = Math.atan2(my, mx) * (180 / Math.PI);
        
        // Adjust for device tilt in portrait mode
        const tilt = Math.asin(Math.max(-1, Math.min(1, -ax)));
        calculatedHeading = calculatedHeading * Math.cos(tilt);
        
        // Normalize to 0-360
        calculatedHeading = (calculatedHeading + 360) % 360;
      } else {
        // Original calculations for landscape/flat orientation
        const pitch = Math.asin(Math.max(-1, Math.min(1, -ax)));
        const roll = Math.atan2(ay, az);

        const mx = magnetometer.x;
        const my = magnetometer.y;
        const mz = magnetometer.z;

        const mx2 = mx * Math.cos(pitch) + mz * Math.sin(pitch);
        const my2 = mx * Math.sin(roll) * Math.sin(pitch) + 
                    my * Math.cos(roll) - 
                    mz * Math.sin(roll) * Math.cos(pitch);

        calculatedHeading = Math.atan2(my2, mx2) * (180 / Math.PI);
        calculatedHeading = (calculatedHeading + 360) % 360;
      }

      // Apply magnetic declination correction
      calculatedHeading = (calculatedHeading + magneticDeclination + 360) % 360;

      // Apply Kalman filter with different parameters for portrait mode
      if (isPortrait) {
        // More aggressive filtering for portrait mode to reduce jitter
        kalmanFilter.R = 0.1; // Increased measurement noise
        kalmanFilter.Q = 0.005; // Reduced process noise
      } else {
        // Original parameters for landscape mode
        kalmanFilter.R = 0.05;
        kalmanFilter.Q = 0.01;
      }
      
      calculatedHeading = kalmanFilter.update(calculatedHeading);

      return isNaN(calculatedHeading) ? lastHeading.current : calculatedHeading;
    } catch (error) {
      return lastHeading.current;
    }
  };

  // Detect figure-8 pattern during calibration
  const detectFigure8Pattern = (heading: number) => {
    const now = Date.now();
    if (now - lastFigure8Time.current >= 100) {
      const point = {
        x: Math.cos(heading * Math.PI / 180),
        y: Math.sin(heading * Math.PI / 180)
      };
      figure8Points.current.push(point);
      lastFigure8Time.current = now;

      // Keep only recent points
      if (figure8Points.current.length > FIGURE8_POINTS_NEEDED) {
        figure8Points.current.shift();
      }

      // Check if we have enough points for pattern detection
      if (figure8Points.current.length >= FIGURE8_POINTS_NEEDED) {
        // Simple pattern detection - check for crossing points
        let crossings = 0;
        for (let i = 1; i < figure8Points.current.length; i++) {
          const prev = figure8Points.current[i - 1];
          const curr = figure8Points.current[i];
          if (Math.sign(prev.y) !== Math.sign(curr.y)) {
            crossings++;
          }
        }
        return crossings >= 4; // At least 2 complete figure-8 patterns
      }
    }
    return false;
  };

  // Enhanced calibration process for vertical orientation
  const startCalibration = () => {
    setIsCalibrating(true);
    setCalibrationProgress(0);
    calibrationPoints.current = [];
    figure8Points.current = [];
    lastCalibrationTime.current = Date.now();
    lastFigure8Time.current = Date.now();
    kalmanFilter.reset();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    Alert.alert(
      'Calibration Instructions',
      'Hold your device vertically (as if taking a photo) and rotate it in a circle. Make sure to keep it upright throughout the calibration.',
      [{ text: 'OK' }]
    );
    
    Animated.sequence([
      Animated.timing(calibrationAnimation, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
      Animated.timing(calibrationAnimation, {
        toValue: 0,
        duration: 4000,
        useNativeDriver: true,
      })
    ]).start(() => {
      if (isCalibrating) {
        startCalibration();
      }
    });
  };

  const stopCalibration = () => {
    setIsCalibrating(false);
    calibrationAnimation.stopAnimation();
    setCalibrationProgress(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const collectCalibrationPoint = (heading: number) => {
    const now = Date.now();
    if (now - lastCalibrationTime.current >= 500) {
      if (detectFigure8Pattern(heading)) {
        calibrationPoints.current.push(heading);
        lastCalibrationTime.current = now;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCalibrationProgress(calibrationPoints.current.length / CALIBRATION_POINTS_NEEDED);
        
        if (calibrationPoints.current.length >= CALIBRATION_POINTS_NEEDED) {
          // Calculate weighted average with more weight to recent points
          const weights = calibrationPoints.current.map((_, i) => i + 1);
          const weightedSum = calibrationPoints.current.reduce((sum, val, i) => 
            sum + val * weights[i], 0);
          const totalWeight = weights.reduce((sum, val) => sum + val, 0);
          const avgHeading = weightedSum / totalWeight;
          
          setHeading(avgHeading);
          lastHeading.current = avgHeading;
          initialCalibrationDone.current = true;
          stopCalibration();
          Alert.alert('Calibration Complete', 'Your compass has been calibrated with improved accuracy.');
        }
      }
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Get magnetic declination on component mount
    getMagneticDeclination();

    let magnetometerSub: any;
    let accelerometerSub: any;
    let lastAccelerometerData = { x: 0, y: 0, z: 0 };

    const sensorUpdateInterval = 100; // ms

    // Set up accelerometer listener
    Accelerometer.setUpdateInterval(sensorUpdateInterval);
    accelerometerSub = Accelerometer.addListener((data) => {
      lastAccelerometerData = data;
    });

    // Set up magnetometer listener
    Magnetometer.setUpdateInterval(sensorUpdateInterval);
    magnetometerSub = Magnetometer.addListener((magData) => {
      // Check for magnetic interference
      const cleanReading = checkMagneticInterference(magData.x, magData.y, magData.z);
      
      if (cleanReading) {
        // Calculate tilt-compensated heading
        const newHeading = calculateHeading(magData, lastAccelerometerData);
        
        if (isCalibrating) {
          collectCalibrationPoint(newHeading);
        } else {
          setHeading(newHeading);
        }
      }
    });

    return () => {
      magnetometerSub?.remove();
      accelerometerSub?.remove();
    };
  }, [isCalibrating, magneticDeclination]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.webMessage}>
          Compass features are not available on web. Please use a mobile device.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.compassContainer}>
        <Compass 
          size={200} 
          color="#60a5fa" 
          style={[
            styles.compass,
            { transform: [{ rotate: `${-heading}deg` }] }
          ]} 
        />
        <Text style={styles.heading}>{Math.round(heading)}°</Text>
        
        {magneticInterference && (
          <Text style={styles.warningText}>Magnetic interference detected!</Text>
        )}
        
        {isCalibrating && (
          <View style={styles.calibrationContainer}>
            <Animated.View 
              style={[
                styles.calibrationIndicator,
                {
                  transform: [{
                    scale: calibrationAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.2]
                    })
                  }]
                }
              ]}
            />
            <Text style={styles.calibrationText}>
              Move your device in a figure-8 pattern
            </Text>
            <Text style={styles.calibrationProgress}>
              {Math.round(calibrationProgress * 100)}%
            </Text>
            <Text style={styles.calibrationHint}>
              Take your time and make smooth movements
            </Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.calibrateButton}
          onPress={() => isCalibrating ? stopCalibration() : startCalibration()}
        >
          <Text style={styles.calibrateButtonText}>
            {isCalibrating ? 'Stop Calibration' : 'Calibrate Compass'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1b1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassContainer: {
    alignItems: 'center',
  },
  compass: {
    marginBottom: 20,
  },
  heading: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  webMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  calibrationContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  calibrationIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#60a5fa',
    marginBottom: 10,
  },
  calibrationText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 5,
  },
  calibrationProgress: {
    color: '#60a5fa',
    fontSize: 14,
    marginBottom: 5,
  },
  calibrationHint: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  calibrateButton: {
    backgroundColor: '#60a5fa',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  calibrateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningText: {
    color: '#f87171',
    fontSize: 14,
    marginBottom: 10,
  },
});
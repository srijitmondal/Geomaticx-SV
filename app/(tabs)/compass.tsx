import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Platform, Animated, Alert, TouchableOpacity } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { Compass } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function CompassScreen() {
  const [heading, setHeading] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const calibrationAnimation = useRef(new Animated.Value(0)).current;
  const lastHeading = useRef(0);
  const calibrationPoints = useRef<number[]>([]);
  const calibrationTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastCalibrationTime = useRef<number>(0);

  const startCalibration = () => {
    setIsCalibrating(true);
    setCalibrationProgress(0);
    calibrationPoints.current = [];
    lastCalibrationTime.current = Date.now();
    
    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Animate the calibration indicator with slower timing
    Animated.sequence([
      Animated.timing(calibrationAnimation, {
        toValue: 1,
        duration: 4000, // Increased from 2000 to 4000
        useNativeDriver: true,
      }),
      Animated.timing(calibrationAnimation, {
        toValue: 0,
        duration: 4000, // Increased from 2000 to 4000
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
    if (calibrationTimeout.current) {
      clearTimeout(calibrationTimeout.current);
      calibrationTimeout.current = null;
    }
    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const collectCalibrationPoint = (heading: number) => {
    const now = Date.now();
    // Only collect points if at least 1 second has passed since the last point
    if (now - lastCalibrationTime.current >= 1000) {
      calibrationPoints.current.push(heading);
      lastCalibrationTime.current = now;
      
      // Trigger haptic feedback for each point collected
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      setCalibrationProgress(calibrationPoints.current.length / 8);
      
      if (calibrationPoints.current.length >= 8) {
        // Calculate average heading from calibration points
        const avgHeading = calibrationPoints.current.reduce((a, b) => a + b, 0) / calibrationPoints.current.length;
        setHeading(avgHeading);
        stopCalibration();
        Alert.alert('Calibration Complete', 'Your compass has been calibrated.');
      }
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;

    DeviceMotion.setUpdateInterval(100);
    
    const subscription = DeviceMotion.addListener(data => {
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
        newHeading = lastHeading.current;
      } else {
        // Normalize heading to 0-360
        newHeading = ((newHeading % 360) + 360) % 360;
        lastHeading.current = newHeading;
      }

      if (isCalibrating) {
        collectCalibrationPoint(newHeading);
      } else {
        setHeading(newHeading);
      }
    });

    return () => {
      subscription.remove();
      if (calibrationTimeout.current) {
        clearTimeout(calibrationTimeout.current);
      }
    };
  }, [isCalibrating]);

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
});
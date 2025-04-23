import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { Magnetometer } from 'expo-sensors';
import { Compass } from 'lucide-react-native';

export default function CompassScreen() {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    Magnetometer.setUpdateInterval(100);
    
    const subscription = Magnetometer.addListener(data => {
      const angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
      setHeading(angle >= 0 ? angle : 360 + angle);
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
  },
  webMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
});
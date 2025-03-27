import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import * as Location from 'expo-location';
import { MapPin } from 'lucide-react-native';

interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
}

export default function MapScreen() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
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
    })();
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.webMessage}>
          Location features are not available on web. Please use a mobile device.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <MapPin size={48} color="#60a5fa" style={styles.icon} />
        {errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : location ? (
          <>
            <Text style={styles.coordText}>
              Latitude: {location.latitude.toFixed(6)}
            </Text>
            <Text style={styles.coordText}>
              Longitude: {location.longitude.toFixed(6)}
            </Text>
            <Text style={styles.coordText}>
              Altitude: {location.altitude?.toFixed(1)}m
            </Text>
            <Text style={styles.coordText}>
              Accuracy: ±{location.accuracy.toFixed(1)}m
            </Text>
          </>
        ) : (
          <Text style={styles.loadingText}>Getting location...</Text>
        )}
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
    padding: 20,
  },
  card: {
    backgroundColor: '#2c2d31',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 20,
  },
  coordText: {
    color: '#fff',
    fontSize: 16,
    marginVertical: 5,
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
  },
  loadingText: {
    color: '#60a5fa',
    fontSize: 16,
  },
  webMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
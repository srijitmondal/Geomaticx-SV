import { StyleSheet, View, Text, TouchableOpacity, Switch, Platform } from 'react-native';
import { useState } from 'react';
import { Camera, Compass, MapPin, Settings as SettingsIcon } from 'lucide-react-native';

export default function SettingsScreen() {
  const [highAccuracy, setHighAccuracy] = useState(true);
  const [saveMetadata, setSaveMetadata] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SettingsIcon size={32} color="#60a5fa" />
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Camera</Text>
        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Camera size={20} color="#60a5fa" />
            <Text style={styles.settingText}>Save Metadata</Text>
          </View>
          <Switch
            value={saveMetadata}
            onValueChange={setSaveMetadata}
            trackColor={{ false: '#3f3f46', true: '#3b82f6' }}
            thumbColor={saveMetadata ? '#60a5fa' : '#71717a'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <MapPin size={20} color="#60a5fa" />
            <Text style={styles.settingText}>High Accuracy GPS</Text>
          </View>
          <Switch
            value={highAccuracy}
            onValueChange={setHighAccuracy}
            trackColor={{ false: '#3f3f46', true: '#3b82f6' }}
            thumbColor={highAccuracy ? '#60a5fa' : '#71717a'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Compass size={20} color="#60a5fa" />
            <Text style={styles.settingText}>Dark Mode</Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: '#3f3f46', true: '#3b82f6' }}
            thumbColor={darkMode ? '#60a5fa' : '#71717a'}
          />
        </View>
      </View>

      {Platform.OS === 'web' && (
        <Text style={styles.webNotice}>
          Note: Some features may not be available in the web version.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1b1e',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 10,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#60a5fa',
    marginBottom: 15,
    fontWeight: '600',
  },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2c2d31',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
  },
  webNotice: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
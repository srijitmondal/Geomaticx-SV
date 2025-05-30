import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { eventEmitter, EVENTS } from '../../utils/events';
import { useEffect, useState } from 'react';
import { Upload, LogOut, RefreshCw, User, Mail, Shield } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

interface UserInfo {
  name: string | null;
  role: string | null;
  id: string | null;
}

const handleImportShapeFile = async () => {
  try {
    // Pick the GeoJSON file
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/geo+json']
    });

    if (!result.canceled) {
      // Read the file
      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);

      try {
        // Parse the GeoJSON data
        const geojson = JSON.parse(fileContent);

        // Validate that it's a GeoJSON file
        if (geojson.type !== 'FeatureCollection' && geojson.type !== 'Feature') {
          throw new Error('Invalid GeoJSON format');
        }

        // Store the GeoJSON data
        await AsyncStorage.setItem('imported_shapes', JSON.stringify(geojson));

        // Emit event to update map
        eventEmitter.emit(EVENTS.SHAPE_IMPORT, geojson);

        Alert.alert('Success', 'GeoJSON file imported successfully');
      } catch (parseError) {
        Alert.alert('Error', 'Invalid GeoJSON file. Please make sure you select a valid GeoJSON file.');
      }
    }
  } catch (error) {
    console.error('Error importing GeoJSON file:', error);
    Alert.alert('Error', 'Failed to import file. Please try again.');
  }
};

export default function SettingsScreen() {
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: null,
    role: null,
    id: null
  });

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const [name, role, id] = await Promise.all([
          AsyncStorage.getItem('userName'),
          AsyncStorage.getItem('userRole'),
          AsyncStorage.getItem('userId')
        ]);

        setUserInfo({ name, role, id });
      } catch (error) {
        console.error('Error loading user info:', error);
      }
    };

    loadUserInfo();
    
    // Listen for logout events to clear the profile data
    const unsubscribe = eventEmitter.on(EVENTS.USER_LOGOUT, () => {
      setUserInfo({ name: null, role: null, id: null });
    });

    return () => {
      unsubscribe.off(EVENTS.USER_LOGOUT);
    };
  }, []);

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(['userId', 'userName', 'userRole']);
              eventEmitter.emit(EVENTS.USER_LOGOUT);
              router.replace("/");
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };
  const handleResetData = () => {
    Alert.alert(
      "Reset Data",
      "Are you sure you want to delete all app data? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete all marker data from AsyncStorage
              await AsyncStorage.removeItem('map_markers');

              // Delete all images from the photos directory
              const photosDir = `${FileSystem.documentDirectory}photos/`;
              const dirInfo = await FileSystem.getInfoAsync(photosDir);
              if (dirInfo.exists) {
                const files = await FileSystem.readDirectoryAsync(photosDir);
                await Promise.all(
                  files.map(async (file) => {
                    const filePath = `${photosDir}${file}`;
                    await FileSystem.deleteAsync(filePath, { idempotent: true });
                  })
                );
              }

              // Emit events to update UI
              eventEmitter.emit(EVENTS.GALLERY_SYNC);

              Alert.alert('Reset Data', 'All data has been successfully deleted.');
            } catch (error) {
              console.error('Error during data reset:', error);
              Alert.alert('Error', 'Failed to reset data. Please try again.');
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* User Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Information</Text>
        <View style={styles.infoItem}>
          <User size={20} color="#666" />
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{userInfo.name || 'N/A'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Shield size={20} color="#666" />
          <Text style={styles.infoLabel}>Role:</Text>
          <Text style={styles.infoValue}>{userInfo.role || 'N/A'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Mail size={20} color="#666" />
          <Text style={styles.infoLabel}>User ID:</Text>
          <Text style={styles.infoValue}>{userInfo.id || 'N/A'}</Text>
        </View>
      </View>

      {/* Actions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        
        <TouchableOpacity style={styles.button} onPress={handleImportShapeFile}>
          <Upload size={20} color="#fff" />
          <Text style={styles.buttonText}>Import Shape File</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleResetData}>
          <RefreshCw size={20} color="#fff" />
          <Text style={styles.buttonText}>Reset App Data</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <LogOut size={20} color="#fff" />
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1b1e',
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  infoLabel: {
    marginLeft: 8,
    fontSize: 16,
    color: '#666',
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  dangerButton: {
    backgroundColor: '#d32f2f',
  },  resetButton: {
    backgroundColor: '#f57c00',
  },
  logoutButton: {
    backgroundColor: '#23792b',
  },
});

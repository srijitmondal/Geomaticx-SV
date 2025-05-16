// filepath: c:\Users\Vayu\Desktop\Latest\Geomaticx-SV\app\(tabs)\settings.tsx
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { eventEmitter, EVENTS } from '../../utils/events';
import { useEffect, useState } from 'react';
import { Upload, LogOut, RefreshCw, User, Mail } from 'lucide-react-native';

const handleImportShapeFile = () => {
  // TODO: Implement shape file import logic from server (base64)
  Alert.alert('Import Shape File', 'Import functionality is not yet implemented.');
};

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
            await AsyncStorage.multiRemove(['userid', 'roleId', 'currentLoginTime', 'userName', 'userEmail']);
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
            // TODO: Implement data deletion logic
            Alert.alert('Reset Data', 'Data reset functionality is not yet implemented.');
          } catch (error) {
            console.error('Error during data reset:', error);
            Alert.alert('Error', 'Failed to reset data. Please try again.');
          }
        }
      }
    ]
  );
};

export default function SettingsScreen() {
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [name, email] = await Promise.all([
          AsyncStorage.getItem('userName'),
          AsyncStorage.getItem('userEmail')
        ]);
        setUserName(name);
        setUserEmail(email);
        
        if (!name || !email) {
          console.warn('User profile data incomplete');
        }
      } catch (error) {
        console.error('Error loading profile data:', error);
      }
    };

    loadProfile();
    
    // Listen for logout events to clear the profile data
    const unsubscribe = eventEmitter.on(EVENTS.USER_LOGOUT, () => {
      setUserName(null);
      setUserEmail(null);
    });

    return () => {
      unsubscribe.off(EVENTS.USER_LOGOUT);
    };
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Thank You</Text>
      
      <View style={styles.profileContainer}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.profileItem}>
          <User size={20} color="#60a5fa" />
          <Text style={styles.profileText}>{userName || 'Not available'}</Text>
        </View>
        <View style={styles.profileItem}>
          <Mail size={20} color="#60a5fa" />
          <Text style={styles.profileText}>{userEmail || 'Not available'}</Text>
        </View>
      </View>

      <View style={styles.actionsContainer}>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  profileContainer: {
    backgroundColor: '#2c2d31',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileText: {
    fontSize: 16,
    color: '#fff',
    marginLeft: 12,
  },
  actionsContainer: {
    padding: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dangerButton: {
    backgroundColor: '#dc2626',
  },
  logoutButton: {
    backgroundColor: '#4b5563',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
});

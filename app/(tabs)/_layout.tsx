import { Tabs } from 'expo-router';
import { Camera, Compass, Map, Image as ImageIcon, RefreshCw, Settings } from 'lucide-react-native';
import { TouchableOpacity, Alert, ActivityIndicator, View, Text } from 'react-native';
import { eventEmitter, EVENTS } from '../../utils/events';
import { useState } from 'react';

export default function TabLayout() {
  const [syncing, setSyncing] = useState(false);

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#333333',
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#666666',
        headerStyle: {
          backgroundColor: '#000000',
        },
        headerTintColor: '#fff',
      }}>

      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ size, color }) => <Map size={size} color={color} />,
        }}
      />

      <Tabs.Screen
        name="camera"
        options={{
          title: 'Survey',
          tabBarIcon: ({ size, color }) => <Camera size={size} color={color} />,
        }}
      />
      
      <Tabs.Screen
        name="compass"
        options={{
          title: 'Compass',
          tabBarIcon: ({ size, color }) => <Compass size={size} color={color} />,
        }}
      />
      
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ size, color }) => <ImageIcon size={size} color={color} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity 
                onPress={() => {                  if (!syncing) {
                    setSyncing(true);
                    import('../../utils/sync').then(({ syncAllMarkers }) => {
                      syncAllMarkers().then((success) => {
                        if (!success) {
                          Alert.alert(
                            'Sync Error',
                            'Failed to sync some markers. Please try again.'
                          );
                        } else {
                          Alert.alert(
                            'Sync Complete',
                            'All markers have been synchronized successfully.'
                          );
                        }
                        setSyncing(false);
                      });
                    }).catch(error => {
                      console.error('Error during sync:', error);
                      Alert.alert(
                        'Sync Error',
                        'An error occurred while syncing. Please try again.'
                      );
                      setSyncing(false);
                    });
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, gap: 8 }}
              >
                {syncing ? (
                  <>
                    <ActivityIndicator color="#fff" size={24} />
                    <Text style={{ color: '#fff' }}>Syncing...</Text>
                  </>
                ) : (
                  <>
                    <RefreshCw color="#fff" size={24} />
                    <Text style={{ color: '#fff' }}>Sync</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
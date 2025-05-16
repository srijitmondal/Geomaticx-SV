import { Tabs } from 'expo-router';
import { Camera, Compass, Map, Image as ImageIcon, RefreshCw, Settings } from 'lucide-react-native';
import { TouchableOpacity, Alert, ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
                onPress={() => {
                  if (!syncing) {
                    setSyncing(true);
                    eventEmitter.emit(EVENTS.GALLERY_SYNC);
                    // Reset syncing state after animation
                    setTimeout(() => setSyncing(false), 1000);
                  }
                }}
                style={{ marginRight: 16 }}
              >
                {syncing ? (
                  <ActivityIndicator color="#fff" size={24} />
                ) : (
                  <RefreshCw size={24} color="#fff" />
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
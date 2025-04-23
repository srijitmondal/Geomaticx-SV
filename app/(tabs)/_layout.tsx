import { Tabs } from 'expo-router';
import { Camera, Compass, Map, Image as ImageIcon } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1a1b1e',
          borderTopColor: '#2c2d31',
        },
        tabBarActiveTintColor: '#60a5fa',
        tabBarInactiveTintColor: '#71717a',
        headerStyle: {
          backgroundColor: '#1a1b1e',
        },
        headerTintColor: '#fff',
      }}>
      <Tabs.Screen
        name="index"
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
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ size, color }) => <Map size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ size, color }) => <ImageIcon size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
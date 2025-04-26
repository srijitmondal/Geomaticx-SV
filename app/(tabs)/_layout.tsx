import { Tabs } from 'expo-router';
import { Camera, Compass, Map, Image as ImageIcon } from 'lucide-react-native';

export default function TabLayout() {
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
        }}
      />
    </Tabs>
  );
}
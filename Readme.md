# SV-Camera


A React Native mobile application for geospatial data collection and synchronization, designed to capture, store, and upload location-based marker data with associated imagery.

## Features

- 📍 Location-based marker creation and management
- 📸 Image capture for center poles and connection points
- 🔄 Automatic data synchronization with remote server
- 💾 Offline data storage with AsyncStorage
- 📱 Cross-platform support (iOS and Android)
- 🔔 Real-time sync status notifications
- 🖼️ Image processing and base64 conversion
- 🌐 Network error handling and retry mechanisms

## Technical Details

- Built with React Native and Expo
- Uses AsyncStorage for local data persistence
- Implements event-driven architecture for sync status updates
- Handles large image files with efficient base64 conversion
- Supports multiple image attachments per marker
- Includes comprehensive error handling and logging

## Use Cases

- Field data collection for geospatial surveys
- Infrastructure inspection and documentation
- Location-based asset management
- Environmental monitoring and documentation

## Requirements

- React Native development environment
- Expo SDK
- AsyncStorage
- FileSystem access
- Network connectivity for data synchronization

## Note

This application is designed for mobile platforms and does not support web deployment.

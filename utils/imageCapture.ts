import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { Magnetometer, DeviceMotion } from 'expo-sensors';

interface SensorData {
  compass: {
    magneticNorth: number;
    trueNorth: number | null;
  };
  orientation: {
    pitch: number;
    roll: number;
    yaw: number;
  };
  acceleration: {
    x: number;
    y: number;
    z: number;
  };
}

interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  timestamp: number;
}

interface CameraMetadata {
  focalLength: number;
  aperture: number;
  iso: number;
  exposureTime: number;
}

interface ImageMetadata {
  timestamp: {
    utc: string;
    local: string;
  };
  location: LocationData | null;
  sensors: SensorData | null;
  camera: CameraMetadata | null;
  positionId: number;
  device: {
    platform: string;
    model: string;
    version: string;
  };
}

export class ImageCaptureError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ImageCaptureError';
  }
}

export async function captureImageWithMetadata(
  cameraRef: any,
  positionId: number = 0,
  options = { quality: 1, format: SaveFormat.JPEG }
): Promise<{ uri: string; metadata: ImageMetadata }> {
  try {
    if (Platform.OS === 'web') {
      throw new ImageCaptureError(
        'Image capture with metadata is not supported on web',
        'PLATFORM_UNSUPPORTED'
      );
    }

    // Start collecting metadata before capture
    const metadataPromise = collectMetadata(positionId);

    // Capture image in parallel with metadata collection
    const photoPromise = cameraRef.current?.takePictureAsync({
      quality: options.quality,
      exif: true,
    });

    // Wait for both operations to complete
    const [metadata, photo] = await Promise.all([metadataPromise, photoPromise]);

    if (!photo?.uri) {
      throw new ImageCaptureError('Failed to capture image', 'CAPTURE_FAILED');
    }

    // Generate unique filename
    const timestamp = new Date().getTime();
    const filename = `IMG_${timestamp}.${options.format}`;
    const directory = `${FileSystem.documentDirectory}photos/`;

    // Ensure directory exists
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

    // Save metadata to separate JSON file
    const metadataFilename = `${filename}.json`;
    await FileSystem.writeAsStringAsync(
      `${directory}${metadataFilename}`,
      JSON.stringify(metadata, null, 2)
    );

    // Move original image to final location
    const finalUri = `${directory}${filename}`;
    await FileSystem.copyAsync({
      from: photo.uri,
      to: finalUri,
    });

    return {
      uri: finalUri,
      metadata,
    };
  } catch (error) {
    if (error instanceof ImageCaptureError) {
      throw error;
    }
    throw new ImageCaptureError(
      `Failed to capture image: ${error.message}`,
      'UNKNOWN_ERROR'
    );
  }
}

async function collectMetadata(positionId: number = 0): Promise<ImageMetadata> {
  // Initialize sensors early
  const [magnetometerPromise, motionPromise] = await Promise.all([
    new Promise<any>((resolve) => {
      const subscription = Magnetometer.addListener((data) => {
        resolve(data);
        subscription.remove();
      });
    }),
    DeviceMotion.isAvailableAsync().then(available => {
      if (!available) return null;
      return new Promise<any>((resolve) => {
        const subscription = DeviceMotion.addListener((data) => {
          resolve(data);
          subscription.remove();
        });
      });
    })
  ]);

  const timestamp = new Date();
  const metadata: ImageMetadata = {
    timestamp: {
      utc: timestamp.toISOString(),
      local: timestamp.toLocaleString(),
    },
    location: null,
    sensors: null,
    camera: null,
    positionId: positionId,
    device: {
      platform: Platform.OS,
      model: Platform.select({ ios: 'iOS', android: 'Android' }) || 'unknown',
      version: Platform.Version.toString(),
    },
  };

  try {
    // Collect location data
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      metadata.location = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };
    }

    // Process sensor data that was collected earlier
    const [magnetometer, motion] = await Promise.all([
      magnetometerPromise,
      motionPromise
    ]);

    metadata.sensors = {
      compass: {
        magneticNorth: Math.atan2(magnetometer?.y || 0, magnetometer?.x || 0) * (180 / Math.PI),
        trueNorth: null,
      },
      orientation: {
        pitch: motion?.rotation?.beta ?? 0,
        roll: motion?.rotation?.gamma ?? 0,
        yaw: motion?.rotation?.alpha ?? 0,
      },
      acceleration: {
        x: motion?.acceleration?.x ?? 0,
        y: motion?.acceleration?.y ?? 0,
        z: motion?.acceleration?.z ?? 0,
      },
    };

  } catch (error) {
    console.warn('Error collecting metadata:', error);
    // Continue with partial metadata rather than failing completely
  }

  return metadata;
}
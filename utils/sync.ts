import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventEmitter, EVENTS } from './events';
import { API_ENDPOINTS } from './config';
import { ImageMetadata } from './imageCapture';

export interface MarkerData {
  id: number;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  centerPollImage: string | null;
  connectionImages: string[];
  connectionCount: number;
  isComplete: boolean;
}

// Use configured API endpoint
export const UPLOAD_ENDPOINT = API_ENDPOINTS.UPLOAD_MARKER;
export const STORAGE_KEY = 'map_markers';

// Convert a file URI to base64
const fileToBase64 = async (uri: string): Promise<string> => {
  try {
    // Check if the file exists first
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error(`File does not exist: ${uri}`);
    }

    console.log(`Reading file: ${uri}, size: ${fileInfo.size} bytes`);
    
    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) {
      throw new Error('Failed to read file as base64');
    }

    console.log(`Successfully read file, base64 length: ${base64.length}`);
    return `data:image/jpeg;base64,${base64}`;
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error reading file');
    console.error('Error converting file to base64:', error);
    throw error;
  }
};

// Convert marker data to upload format
const convertMarkerToUploadFormat = async (marker: MarkerData) => {
  console.log('Processing centerPollImage:', marker.centerPollImage);
  
  // Handle center poll image
  let centerPoleBase64 = null;
  let centerPoleMetadata = null;
  if (marker.centerPollImage) {
    try {
      const uri = marker.centerPollImage;
      console.log('Reading center poll image from:', uri);
      centerPoleBase64 = await fileToBase64(uri);
      
      // Try to read metadata file
      const metadataUri = `${uri}.json`;
      const metadataInfo = await FileSystem.getInfoAsync(metadataUri);
      if (metadataInfo.exists) {
        const metadataContent = await FileSystem.readAsStringAsync(metadataUri);
        centerPoleMetadata = JSON.parse(metadataContent) as ImageMetadata;
      }
      
      console.log('Successfully converted center poll image to base64');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error occurred');
      console.error('Error converting center poll image:', error);
      throw new Error('Failed to convert center poll image: ' + error.message);
    }
  }
  
  // Handle branch images
  console.log('Processing branch images:', marker.connectionImages.length);
  const branchImagesBase64 = await Promise.all(
    marker.connectionImages.map(async (img, index) => {
      try {
        console.log(`Reading branch image ${index + 1}/${marker.connectionImages.length}:`, img);
        const base64 = await fileToBase64(img);
        
        // Try to read metadata file
        let metadata: ImageMetadata | null = null;
        const metadataUri = `${img}.json`;
        const metadataInfo = await FileSystem.getInfoAsync(metadataUri);
        if (metadataInfo.exists) {
          const metadataContent = await FileSystem.readAsStringAsync(metadataUri);
          metadata = JSON.parse(metadataContent) as ImageMetadata;
        }
        
        console.log(`Successfully converted branch image ${index + 1}`);
        return {
          url: base64,
          heading: metadata?.sensors?.compass?.magneticNorth ?? 0,
          timestamp: metadata?.timestamp?.utc ?? new Date().toISOString(),
          deviceInfo: {
            model: metadata?.device?.model ?? (Platform.OS === 'ios' ? 'iOS' : 'Android'),
            manufacturer: metadata?.device?.platform ?? 'Unknown'
          },
          imageProperties: {
            width: 4032,
            height: 3024,
            format: 'jpeg'
          },
          metadata: metadata
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error occurred');
        console.error(`Error converting branch image ${index + 1}:`, error);
        throw new Error(`Failed to convert branch image ${index + 1}: ${error.message}`);
      }
    })
  );

  return {
    markerId: `marker_${marker.id}`,
    timestamp: new Date().toISOString(),
    location: marker.coordinate,
    centerPole: centerPoleBase64 ? {
      url: centerPoleBase64,
      metadata: centerPoleMetadata ?? { timestamp: new Date().toISOString() },
      deviceInfo: {
        model: centerPoleMetadata?.device?.model ?? (Platform.OS === 'ios' ? 'iOS' : 'Android'),
        manufacturer: centerPoleMetadata?.device?.platform ?? 'Unknown'
      },
      imageProperties: {
        width: 4032,
        height: 3024,
        format: 'jpeg'
      }
    } : null,
    branchImages: branchImagesBase64
  };
};

export const uploadMarkerData = async (data: MarkerData): Promise<boolean> => {
  try {
    console.log(`Converting marker ${data.id} to upload format...`);
    const uploadData = await convertMarkerToUploadFormat(data);
    
    console.log(`Preparing to upload marker ${data.id}...`);
    console.log(`Center poll image: ${data.centerPollImage ? 'Present' : 'Missing'}`);
    console.log(`Branch images: ${data.connectionImages.length} of ${data.connectionCount} required`);
    
    // Log the size of the payload
    const payloadSize = new Blob([JSON.stringify(uploadData)]).size;
    console.log(`Upload payload size: ${(payloadSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`Sending POST request to ${UPLOAD_ENDPOINT}...`);
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify(uploadData),
    });

    // Handle 4xx and 5xx errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}\n${errorText}`);
    }

    const result = await response.text();
    console.log('Upload result:', result);
    return result.includes('✅'); // Check for success indicator

  } catch (error) {
    console.error('Error uploading marker data:', error);
    if (error instanceof Error && error.message.includes('Network request failed')) {
      throw new Error('Network error: Check your internet connection');
    }
    throw error;
  }
};

// Function to sync all unsynchronized markers
export const syncAllMarkers = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    throw new Error('Sync is not supported on web platform');
  }

  try {
    console.log('Starting sync process...');
    eventEmitter.emit(EVENTS.SYNC_START);
    
    // Get markers from AsyncStorage
    const storedMarkersJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!storedMarkersJson) {
      console.log('No markers found in storage');
      eventEmitter.emit(EVENTS.SYNC_COMPLETE);
      return true;
    }

    const markers: MarkerData[] = JSON.parse(storedMarkersJson);
    console.log(`Found ${markers.length} markers to sync`);

    if (markers.length === 0) {
      console.log('No markers to sync');
      eventEmitter.emit(EVENTS.SYNC_COMPLETE);
      return true;
    }

    // Only sync completed markers
    const completeMarkers = markers.filter(m => m.isComplete);
    console.log(`${completeMarkers.length} complete markers to sync`);

    let successCount = 0;
    let failures: { markerId: number; error: string }[] = [];

    // Process markers one by one
    for (let i = 0; i < completeMarkers.length; i++) {
      const marker = completeMarkers[i];
      console.log(`Processing marker: ${marker.id} (${i + 1}/${completeMarkers.length})`);

      try {
        // Check if marker has required data
        if (!marker.centerPollImage || marker.connectionImages.length < marker.connectionCount) {
          throw new Error('Marker is missing required images');
        }

        console.log(`Uploading marker ${marker.id}...`);
        await uploadMarkerData(marker);
        console.log(`Successfully uploaded marker ${marker.id}`);
        successCount++;

        // Emit progress
        eventEmitter.emit(EVENTS.SYNC_PROGRESS, {
          current: i + 1,
          total: completeMarkers.length
        });

      } catch (error) {
        console.error(`Error processing marker ${marker.id}:`, error);
        failures.push({
          markerId: marker.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Emit error but continue processing
        eventEmitter.emit(EVENTS.SYNC_ERROR, { 
          message: `Failed to sync marker ${marker.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    // Final status
    console.log(`Sync complete. Success: ${successCount}, Failed: ${failures.length}`);
    
    if (failures.length > 0) {
      const errorMessage = failures
        .map(f => `Marker ${f.markerId}: ${f.error}`)
        .join('\n');
      eventEmitter.emit(EVENTS.SYNC_ERROR, { message: errorMessage });
      return false;
    }

    eventEmitter.emit(EVENTS.SYNC_COMPLETE);
    return true;

  } catch (error) {
    console.error('Error in sync process:', error);
    eventEmitter.emit(EVENTS.SYNC_ERROR, { 
      message: error instanceof Error ? error.message : 'Unknown error occurred during sync'
    });
    return false;
  }
};

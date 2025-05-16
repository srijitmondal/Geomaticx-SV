// Structure for center image data
const centerImageData = {
  url: '',
  metadata: {
    timestamp: '',
    location: {
      latitude: 0,
      longitude: 0,
    },
    deviceInfo: {
      model: '',
      manufacturer: '',
    },
    imageProperties: {
      width: 0,
      height: 0,
      format: '',
    }
  }
};

// Structure for multiple branch images data
const branchImagesData = {
  images: [
    {
      url: '',
      metadata: {
        timestamp: '',
        location: {
          latitude: 0,
          longitude: 0,
        },
        deviceInfo: {
          model: '',
          manufacturer: '',
        },
        imageProperties: {
          width: 0,
          height: 0,
          format: '',
        }
      }
    }
  ]
};

// Structure for marker data
const markerData = {
  latitude: 0,
  longitude: 0,
  timestamp: '',
  description: ''
};

// Function to sync center image data
const syncCenterImage = async (data) => {
  try {
    const response = await fetch('https://geomaticx-cam-backend.onrender.com/center-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    console.error('Error syncing center image:', error);
    throw error;
  }
};

// Function to sync multiple branch images data
const syncBranchImages = async (imagesData) => {
  try {
    const response = await fetch('https://geomaticx-cam-backend.onrender.com/branch-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(imagesData)
    });
    return await response.json();
  } catch (error) {
    console.error('Error syncing branch images:', error);
    throw error;
  }
};

// Function to sync marker data
const syncMarkerLocation = async (data) => {
  try {
    const response = await fetch('https://geomaticx-cam-backend.onrender.com/marker', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    console.error('Error syncing marker location:', error);
    throw error;
  }
};

// Main sync function that orchestrates all sync operations
const performSync = async (centerImage, branchImages, marker) => {
  try {
    const [centerResult, branchResults, markerResult] = await Promise.all([
      syncCenterImage(centerImage),
      syncBranchImages(branchImages),
      syncMarkerLocation(marker)
    ]);

    return {
      success: true,
      data: {
        centerImage: centerResult,
        branchImages: branchResults,
        marker: markerResult
      }
    };
  } catch (error) {
    console.error('Sync failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export {
  centerImageData,
  branchImagesData,
  markerData,
  syncCenterImage,
  syncBranchImages,
  syncMarkerLocation,
  performSync
};

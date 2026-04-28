import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const locationOptions = {
  enableHighAccuracy: false,
  maximumAge: 10 * 60 * 1000,
  timeout: 8000,
};

const getBrowserCoordinates = () =>
  new Promise<Coordinates | null>((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => resolve(null),
      locationOptions,
    );
  });

/**
 * Reads the user's current device location. Native APK uses Capacitor permissions,
 * while browser preview keeps using the Web Geolocation API.
 */
export async function getCurrentCoordinates(): Promise<Coordinates | null> {
  if (!Capacitor.isNativePlatform()) {
    return getBrowserCoordinates();
  }

  try {
    const permission = await Geolocation.requestPermissions({
      permissions: ['coarseLocation'],
    });

    if (permission.coarseLocation !== 'granted' && permission.location !== 'granted') {
      return null;
    }

    const position = await Geolocation.getCurrentPosition(locationOptions);
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (error) {
    console.info('Unable to read current location:', error);
    return null;
  }
}

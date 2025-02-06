// MapWithDirections.js
import React, { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions';

function MapWithDirections({ userLocation, propertyCoords, mapboxToken }) {
  const mapContainerRef = useRef(null);

  useEffect(() => {
    // 1. Set access token (MUST be set before using mapboxgl)
    mapboxgl.accessToken = mapboxToken;

    // 2. Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [-98.35, 39.5], // default center (USA-ish)
      zoom: 3,
    });

    // 3. Directions control
    const directions = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: 'imperial', // or "metric"
      profile: 'mapbox/driving', // or "walking", "cycling"
      interactive: false, // if you want to let user drag markers, set to true
    });

    // 4. Add directions to the map
    map.addControl(directions, 'top-left');

    // 5. If userLocation and propertyCoords are known, set them as origin & destination
    if (userLocation && propertyCoords) {
      directions.setOrigin([userLocation.lng, userLocation.lat]);
      directions.setDestination([propertyCoords.lng, propertyCoords.lat]);
    }

    // Cleanup on unmount
    return () => map.remove();
  }, [userLocation, propertyCoords, mapboxToken]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '400px' }}
    />
  );
}

export default MapWithDirections;

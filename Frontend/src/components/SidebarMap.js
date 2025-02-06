// SidebarMap.js (a.k.a MapWithDirections)
import React, { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions';

function SidebarMap({ mapboxToken, selectedCoords }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const directionsRef = useRef(null);

  useEffect(() => {
    // 1. Set the token
    mapboxgl.accessToken = mapboxToken;

    // 2. Initialize the map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [-98.35, 39.5], // default center
      zoom: 3,
    });
    mapRef.current = map;

    // 3. Create directions
    const directions = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: 'imperial',
      profile: 'mapbox/driving',
      interactive: false,
    });
    directionsRef.current = directions;

    // 4. Add to the map
    map.addControl(directions, 'top-left');

    return () => map.remove();
  }, [mapboxToken]);

  // 5. Whenever selectedCoords changes, set the destination
  useEffect(() => {
    if (selectedCoords && directionsRef.current) {
      // If you also have user location, you'd do setOrigin(...) first
      directionsRef.current.setDestination([selectedCoords.lng, selectedCoords.lat]);
    }
  }, [selectedCoords]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: '80%',
        height: '250px',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    />
  );
}

export default SidebarMap;

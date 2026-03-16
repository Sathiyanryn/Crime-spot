import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { AppTheme } from '@/constants/theme';

type MarkerTone = 'red' | 'blue' | 'green' | 'yellow';

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  tone?: MarkerTone;
}

interface DashboardMapCardProps {
  title: string;
  subtitle?: string;
  markers: MapMarker[];
}

let EmbeddedWebView: React.ComponentType<any> | null = null;

try {
  EmbeddedWebView = require('react-native-webview').WebView;
} catch (error) {
  console.warn('react-native-webview is unavailable in this build. Falling back to external map links.');
}

const toneToHex = (tone: MarkerTone) => {
  if (tone === 'blue') return AppTheme.colors.mapUser;
  if (tone === 'green') return AppTheme.colors.mapPatrol;
  if (tone === 'yellow') return AppTheme.colors.crimeLow;
  return AppTheme.colors.mapCrime;
};

const openExternalMap = async (markers: MapMarker[]) => {
  if (markers.length === 0) {
    return;
  }

  const primary = markers[0];
  await Linking.openURL(`https://www.openstreetmap.org/?mlat=${primary.lat}&mlon=${primary.lng}#map=15/${primary.lat}/${primary.lng}`);
};

const buildCenter = (markers: MapMarker[]) => {
  if (markers.length === 0) {
    return {
      latitude: 12.9716,
      longitude: 77.5946,
    };
  }

  const latitudes = markers.map((marker) => marker.lat);
  const longitudes = markers.map((marker) => marker.lng);

  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
};

const buildLeafletHtml = (markers: MapMarker[]) => {
  const center = buildCenter(markers);
  const markersJson = JSON.stringify(
    markers.map((marker) => ({
      ...marker,
      color: toneToHex(marker.tone || 'red'),
    }))
  );

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #map {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #06111f;
      }
      .leaflet-container {
        background:
          radial-gradient(circle at top, rgba(38,198,218,0.18), transparent 45%),
          linear-gradient(180deg, #0a1628 0%, #06111f 100%);
        font-family: sans-serif;
      }
      .leaflet-control-attribution {
        display: none;
      }
      .marker-dot {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 3px solid #f8fbff;
        box-shadow: 0 0 0 5px rgba(6, 17, 31, 0.5);
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""></script>
    <script>
      const markers = ${markersJson};
      const map = L.map('map', {
        zoomControl: true,
        attributionControl: false,
      }).setView([${center.latitude}, ${center.longitude}], markers.length > 1 ? 13 : 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const bounds = [];

      markers.forEach((marker) => {
        const icon = L.divIcon({
          className: '',
          html: '<div class="marker-dot" style="background:' + marker.color + ';"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        L.marker([marker.lat, marker.lng], { icon })
          .addTo(map)
          .bindPopup(marker.label);

        bounds.push([marker.lat, marker.lng]);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [28, 28] });
      }
    </script>
  </body>
</html>`;
};

export default function DashboardMapCard({ title, subtitle, markers }: DashboardMapCardProps) {
  const visibleMarkers = markers.slice(0, 8);
  const center = useMemo(() => buildCenter(visibleMarkers), [visibleMarkers]);
  const mapHtml = useMemo(() => buildLeafletHtml(visibleMarkers), [visibleMarkers]);
  const canRenderEmbeddedMap = visibleMarkers.length > 0 && EmbeddedWebView;
  const WebViewComponent = EmbeddedWebView;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Risk Overlay</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {visibleMarkers.length > 0 ? (
          <TouchableOpacity style={styles.actionButton} onPress={() => openExternalMap(visibleMarkers)}>
            <Text style={styles.actionText}>Open</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.mapContainer}>
        {canRenderEmbeddedMap && WebViewComponent ? (
          <WebViewComponent
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
          />
        ) : visibleMarkers.length > 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Embedded map unavailable</Text>
            <Text style={styles.emptySubtitle}>
              Open the map externally to review the active safety overlay.
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Waiting for coordinates</Text>
            <Text style={styles.emptySubtitle}>Live positions will appear here once the dashboard has active data.</Text>
          </View>
        )}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Visible Points</Text>
          <Text style={styles.summaryValue}>{visibleMarkers.length}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Center</Text>
          <Text style={styles.summaryValue}>
            {center.latitude.toFixed(3)}, {center.longitude.toFixed(3)}
          </Text>
        </View>
      </View>

      {visibleMarkers.length > 0 ? (
        <View style={styles.legend}>
          {visibleMarkers.slice(0, 3).map((marker, index) => (
            <View key={`${marker.label}-${index}`} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: toneToHex(marker.tone || 'red') }]} />
              <Text style={styles.legendText}>{marker.label}</Text>
            </View>
          ))}
          {visibleMarkers.length > 3 ? <Text style={styles.moreText}>+{visibleMarkers.length - 3} more points</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: AppTheme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    color: AppTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  actionButton: {
    backgroundColor: AppTheme.colors.primaryDeep,
    borderRadius: AppTheme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  mapContainer: {
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    backgroundColor: AppTheme.colors.background,
  },
  webview: {
    flex: 1,
    backgroundColor: AppTheme.colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: AppTheme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: AppTheme.colors.backgroundAlt,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  summaryLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    color: AppTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  legend: {
    marginTop: 12,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  moreText: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
  },
});

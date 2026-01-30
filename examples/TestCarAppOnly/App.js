import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Platform } from 'react-native';
import CarProjection, { createListTemplate } from 'react-native-car-projection';

/**
 * Example: Car App only (no media).
 * - mediaSupport: false → no MediaBrowserService
 * - mediaOnly: false → Car App Service is added
 * - carAppCategory: "navigation" → app appears in navigation category on Android Auto
 * Works on both iOS and Android; Car App UI appears on Android Auto when connected.
 */
export default function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    CarProjection.registerScreen({
      name: 'main',
      template: createListTemplate({
        title: 'Car App Only',
        header: 'Navigation Example',
        items: [
          { title: 'Item 1', texts: ['Car App only – no media'] },
          { title: 'Item 2', texts: ['Template UI on Android Auto'] },
        ],
      }),
    });
    CarProjection.startSession();
  }, []);

  useEffect(() => {
    const subStarted = CarProjection.addSessionStartedListener(() => setConnected(true));
    const subEnded = CarProjection.addSessionEndedListener(() => setConnected(false));
    return () => {
      subStarted.remove();
      subEnded.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>TestCarAppOnly</Text>
      <Text style={styles.subtitle}>Car App only (no media)</Text>
      <Text style={styles.hint}>
        {Platform.OS === 'android'
          ? connected
            ? 'Android Auto connected – check your car screen'
            : 'Connect to Android Auto to see the Car App UI'
          : 'Car projection is Android-only. Run on Android device + DHU to test.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  hint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});

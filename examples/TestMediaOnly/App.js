import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Platform } from 'react-native';
import TrackPlayer, { State, Capability, AppKilledPlaybackBehavior, Event } from 'react-native-track-player';
import CarProjection from 'react-native-car-projection';
import { mediaItems } from './src/data/mediaItems';

/**
 * Example: Media only (no Car App).
 * - mediaOnly: true → only MediaBrowserService, no Car App Service.
 * - DHU discovers app as media source only (like Spotify). Browse + now-playing.
 * Works on both iOS and Android; Android Auto shows media browse and now-playing only.
 */
const ROOT_ID = '__ROOT__';

const setupPlayer = async () => {
  try {
    await TrackPlayer.setupPlayer({ waitForBuffer: true });
    await TrackPlayer.updateOptions({
      android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
      capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      progressUpdateEventInterval: 2,
    });
    return true;
  } catch (e) {
    try {
      await TrackPlayer.getPlaybackState();
      return true;
    } catch (_) {
      return false;
    }
  }
};

const stateToString = (s) => {
  if (s === State.Playing) return 'playing';
  if (s === State.Paused) return 'paused';
  if (s === State.Stopped || s === State.Ready || s === State.None) return 'stopped';
  return 'none';
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playbackState, setPlaybackState] = useState(State.None);
  const trackRef = useRef(null);

  const syncMediaSession = useCallback(async () => {
    try {
      const [state, progress] = await Promise.all([TrackPlayer.getPlaybackState(), TrackPlayer.getProgress()]);
      const track = trackRef.current;
      await CarProjection.updateMediaPlaybackState({
        state: stateToString(state?.state),
        position: progress?.position ?? 0,
        duration: progress?.duration ?? 0,
        title: track?.title,
        artist: track?.artist,
      });
    } catch (_) {}
  }, []);

  useEffect(() => {
    CarProjection.configureMediaSession({
      serviceName: 'com.doublesymmetry.trackplayer.service.MusicService',
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const browseTree = {
      [ROOT_ID]: mediaItems.map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        playable: true,
        browsable: false,
      })),
    };
    CarProjection.setMediaBrowseTree(browseTree).catch(() => {});
  }, []);

  useEffect(() => {
    const sub = CarProjection.addMediaPlayFromIdListener((event) => {
      const item = mediaItems.find((m) => m.id === event.mediaId);
      if (item) playTrack(item);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let subState, subTrack;
    const init = async () => {
      const ok = await setupPlayer();
      setReady(ok);
      if (!ok) return;
      subState = TrackPlayer.addEventListener(Event.PlaybackState, (e) => {
        setPlaybackState(e.state);
        syncMediaSession();
      });
      subTrack = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (e) => {
        const t = e.track ? mediaItems.find((m) => m.id === e.track.id) : null;
        trackRef.current = t ?? null;
        setCurrentTrack(t ?? null);
        syncMediaSession();
      });
    };
    init();
    return () => {
      subState?.remove?.();
      subTrack?.remove?.();
    };
  }, [syncMediaSession]);

  const playTrack = async (item) => {
    try {
      await TrackPlayer.add({
        id: item.id,
        url: item.mediaUri,
        title: item.title,
        artist: item.artist,
      });
      await TrackPlayer.play();
      trackRef.current = item;
      setCurrentTrack(item);
    } catch (e) {
      console.warn(e);
    }
  };

  const togglePlayPause = async () => {
    try {
      const state = await TrackPlayer.getPlaybackState();
      if (state?.state === State.Playing) await TrackPlayer.pause();
      else await TrackPlayer.play();
      syncMediaSession();
    } catch (_) {}
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>TestMediaOnly</Text>
      <Text style={styles.subtitle}>Media only (browse + now-playing, no Car App UI)</Text>
      {Platform.OS === 'android' && (
        <Text style={styles.hint}>Connect to Android Auto: media slot only; no template UI.</Text>
      )}
      {!ready && <Text style={styles.hint}>Initializing player…</Text>}
      {ready && (
        <>
          {currentTrack && (
            <View style={styles.nowPlaying}>
              <Text style={styles.nowTitle}>{currentTrack.title}</Text>
              <Text style={styles.nowArtist}>{currentTrack.artist}</Text>
              <TouchableOpacity style={styles.button} onPress={togglePlayPause}>
                <Text>{playbackState === State.Playing ? 'Pause' : 'Play'}</Text>
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            data={mediaItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => playTrack(item)}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowArtist}>{item.artist}</Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 16 },
  hint: { fontSize: 14, color: '#888', marginBottom: 16 },
  nowPlaying: { marginBottom: 16, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 },
  nowTitle: { fontWeight: '600' },
  nowArtist: { color: '#666', marginTop: 4 },
  button: { marginTop: 8, padding: 8, backgroundColor: '#ddd', alignSelf: 'flex-start', borderRadius: 4 },
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowTitle: { fontWeight: '500' },
  rowArtist: { fontSize: 12, color: '#666', marginTop: 2 },
});

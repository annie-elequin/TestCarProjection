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
 *
 * Media browsing content is set via setMediaBrowseTree(). The tree is a map:
 * - Key "__ROOT__" = items shown at the root of the browse screen in Android Auto.
 * - Key "<item.id>" = children when user taps a browsable item (e.g. "Recently Played").
 * - playable: true = tap starts playback (track); browsable: true = tap opens children (folder).
 * This example adds a "Recently Played" folder with the last 3 played items.
 */
const ROOT_ID = '__ROOT__';
const RECENTLY_PLAYED_ID = 'recently_played';
const MAX_RECENT = 3;

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
  const [recentlyPlayed, setRecentlyPlayed] = useState([]); // last 3 played items (most recent first)
  const trackRef = useRef(null);
  const recentlyPlayedRef = useRef([]);
  useEffect(() => {
    recentlyPlayedRef.current = recentlyPlayed;
  }, [recentlyPlayed]);

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

  // Build the Android Auto browse tree: root + "Recently Played" folder with last 3 played.
  // When user taps "Recently Played" on the car screen, they see these items.
  useEffect(() => {
    const rootItems = [
      // Browsable folder: tap opens children (key = RECENTLY_PLAYED_ID below)
      {
        id: RECENTLY_PLAYED_ID,
        title: 'Recently Played',
        browsable: true,
        playable: false,
      },
      // All tracks at root (playable)
      ...mediaItems.map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        playable: true,
        browsable: false,
      })),
    ];
    const recentAsBrowseItems = recentlyPlayed.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      playable: true,
      browsable: false,
    }));
    const browseTree = {
      [ROOT_ID]: rootItems,
      [RECENTLY_PLAYED_ID]: recentAsBrowseItems, // children of "Recently Played"
    };
    CarProjection.setMediaBrowseTree(browseTree).catch(() => {});
  }, [recentlyPlayed]);

  // When DHU connects (plug in or select app), sync state and auto-play so audio routes to car
  useEffect(() => {
    const sub = CarProjection.addMediaBrowserConnectedListener(() => {
      (async () => {
        try {
          await syncMediaSession();
          const [state, activeTrack] = await Promise.all([
            TrackPlayer.getPlaybackState(),
            TrackPlayer.getActiveTrack(),
          ]);
          const wasPlaying = state?.state === State.Playing;
          const mediaTrack = activeTrack ? mediaItems.find((m) => m.id === activeTrack.id) : null;

          if (mediaTrack) {
            trackRef.current = mediaTrack;
            setCurrentTrack(mediaTrack);
            if (wasPlaying) {
              const progress = await TrackPlayer.getProgress();
              await TrackPlayer.pause();
              await new Promise((r) => setTimeout(r, 2000));
              if (progress?.position > 0) await TrackPlayer.seekTo(progress.position);
              await TrackPlayer.play();
              setPlaybackState(State.Playing);
            } else {
              await TrackPlayer.play();
              setPlaybackState(State.Playing);
            }
            await syncMediaSession();
          } else if (recentlyPlayedRef.current?.length > 0) {
            const first = recentlyPlayedRef.current[0];
            playTrack(first);
            await syncMediaSession();
          }
        } catch (e) {
          console.warn('[TestMediaOnly] onMediaBrowserConnected:', e?.message);
        }
      })();
    });
    return () => sub.remove();
  }, [syncMediaSession]);

  // When user taps Play on the DHU: resume or start first recently played
  useEffect(() => {
    const sub = CarProjection.addMediaPlayListener(() => {
      (async () => {
        try {
          const [state, activeTrack] = await Promise.all([
            TrackPlayer.getPlaybackState(),
            TrackPlayer.getActiveTrack(),
          ]);
          if (activeTrack && state?.state !== State.Playing) {
            await TrackPlayer.play();
            setPlaybackState(State.Playing);
            syncMediaSession();
          } else if (!activeTrack && recentlyPlayedRef.current?.length > 0) {
            playTrack(recentlyPlayedRef.current[0]);
            syncMediaSession();
          }
        } catch (_) {}
      })();
    });
    return () => sub.remove();
  }, [syncMediaSession]);

  // When user taps Pause on the DHU
  useEffect(() => {
    const sub = CarProjection.addMediaPauseListener(() => {
      TrackPlayer.pause()
        .then(() => {
          setPlaybackState(State.Paused);
          syncMediaSession();
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [syncMediaSession]);

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
      // Add to recently played (most recent first, keep last MAX_RECENT)
      setRecentlyPlayed((prev) => {
        const next = [item, ...prev.filter((p) => p.id !== item.id)].slice(0, MAX_RECENT);
        return next;
      });
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
          {recentlyPlayed.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Recently played (last 3, shown in Android Auto browse)</Text>
              {recentlyPlayed.map((item) => (
                <TouchableOpacity key={item.id} style={styles.row} onPress={() => playTrack(item)}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowArtist}>{item.artist}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
  recentSection: { marginBottom: 16 },
  recentTitle: { fontSize: 14, color: '#666', marginBottom: 8, fontWeight: '600' },
  nowPlaying: { marginBottom: 16, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 },
  nowTitle: { fontWeight: '600' },
  nowArtist: { color: '#666', marginTop: 4 },
  button: { marginTop: 8, padding: 8, backgroundColor: '#ddd', alignSelf: 'flex-start', borderRadius: 4 },
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowTitle: { fontWeight: '500' },
  rowArtist: { fontSize: 12, color: '#666', marginTop: 2 },
});

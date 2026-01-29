import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, { 
  State,
  Capability,
  AppKilledPlaybackBehavior,
  Event,
} from 'react-native-track-player';
import CarProjection, { createListTemplate, createMessageTemplate, createPaneTemplate } from 'react-native-car-projection';
import { mediaItems } from './src/data/mediaItems';

const RECENTLY_PLAYED_KEY = 'recently_played';
const MAX_RECENT_ITEMS = 10;

// Setup track player with options
const setupPlayer = async () => {
  console.log('[App] Setting up track player...');
  try {
    console.log('[App] Calling TrackPlayer.setupPlayer()...');
    await TrackPlayer.setupPlayer({
      waitForBuffer: true,
    });
    console.log('[App] TrackPlayer.setupPlayer() complete, updating options...');
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      progressUpdateEventInterval: 2,
    });
    console.log('[App] Track player setup complete!');
    return true;
  } catch (error) {
    console.log('[App] Track player setup error:', error.message || error);
    // Check if player is already initialized
    try {
      const state = await TrackPlayer.getPlaybackState();
      console.log('[App] Player already initialized, state:', state);
      return true;
    } catch (e) {
      console.log('[App] Player not initialized:', e.message);
      return false;
    }
  }
};

export default function App() {
  console.log('[App] ===== App component rendering =====');
  
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  
  // Use ref to track current track for Android Auto screen updates
  const currentTrackRef = useRef(null);
  const isPlayingRef = useRef(false);
  const recentlyPlayedRef = useRef([]);
  
  // Keep refs in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize track player and load recently played
  useEffect(() => {
    console.log('[App] useEffect for track player starting...');
    
    let playbackStateListener = null;
    let trackChangedListener = null;
    let progressListener = null;
    
    const init = async () => {
      try {
        console.log('[App] Starting init...');
        const ready = await setupPlayer();
        console.log('[App] Setup player returned:', ready);
        setIsPlayerReady(ready);
        await loadRecentlyPlayed();
        console.log('[App] Init complete');
        
        // Listen to track player events (after setup)
        playbackStateListener = TrackPlayer.addEventListener(
          Event.PlaybackState,
          (event) => {
            console.log('[App] Playback state changed:', event.state);
            const playing = event.state === State.Playing;
            setIsPlaying(playing);
            isPlayingRef.current = playing;
            
            // Update Now Playing screen when state changes
            if (currentTrackRef.current) {
              updateNowPlayingScreen(currentTrackRef.current, playing);
            }
          }
        );
        
        trackChangedListener = TrackPlayer.addEventListener(
          Event.PlaybackActiveTrackChanged,
          async (event) => {
            console.log('[App] Active track changed:', event);
            if (event.track) {
              // Find the matching media item
              const track = mediaItems.find(item => item.id === event.track.id);
              if (track) {
                setCurrentTrack(track);
                currentTrackRef.current = track;
              }
            }
          }
        );
        
        // Listen to progress updates
        progressListener = TrackPlayer.addEventListener(
          Event.PlaybackProgressUpdated,
          (event) => {
            setProgress({ position: event.position, duration: event.duration });
          }
        );
        
        console.log('[App] Event listeners set up');
      } catch (error) {
        console.log('[App] Error during init:', error.message || error);
      }
    };
    
    init();
    
    return () => {
      if (playbackStateListener) playbackStateListener.remove();
      if (trackChangedListener) trackChangedListener.remove();
      if (progressListener) progressListener.remove();
    };
  }, []);

  const loadRecentlyPlayed = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENTLY_PLAYED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setRecentlyPlayed(parsed);
        recentlyPlayedRef.current = parsed;
      }
    } catch (error) {
      console.log('[App] Error loading recently played:', error);
    }
  };

  const saveRecentlyPlayed = async (items) => {
    try {
      await AsyncStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(items));
    } catch (error) {
      console.log('[App] Error saving recently played:', error);
    }
  };

  const addToRecentlyPlayed = useCallback((track) => {
    setRecentlyPlayed((prev) => {
      // Remove if already exists, then add to front
      const filtered = prev.filter((item) => item.id !== track.id);
      const updated = [track, ...filtered].slice(0, MAX_RECENT_ITEMS);
      recentlyPlayedRef.current = updated;
      saveRecentlyPlayed(updated);
      return updated;
    });
  }, []);

  // Update the Recently Played screen in Android Auto
  const updateRecentlyPlayedScreen = useCallback(() => {
    const recent = recentlyPlayedRef.current;
    
    // Android Auto only allows 1 action with a custom title in the action strip
    // So we only use "Browse All" on the main screen
    const mainScreenActionStrip = [
      {
        title: 'Browse All',
        onPress: () => {
          console.log('[App] Navigate to Browse All');
          CarProjection.navigateToScreen('browse');
        },
      },
    ];
    
    // MessageTemplate only allows 1 action with custom title in action strip
    const messageActionStripItems = [
      {
        title: 'Browse All',
        onPress: () => {
          console.log('[App] Navigate to Browse All');
          CarProjection.navigateToScreen('browse');
        },
      },
    ];
    
    if (recent.length === 0) {
      // Show "Nothing recently played" message (MessageTemplate allows only 1 action strip item)
      CarProjection.registerScreen({
        name: 'main',
        template: createMessageTemplate({
          title: 'Recently Played',
          message: 'Nothing recently played.\n\nSelect something from the media library on your phone to start listening.',
          actionStrip: messageActionStripItems,
        }),
      });
    } else {
      // Show recently played list (ListTemplate supports multiple action strip items)
      CarProjection.registerScreen({
        name: 'main',
        template: createListTemplate({
          title: 'Recently Played',
          actionStrip: mainScreenActionStrip,
          items: recent.map((item) => ({
            title: item.title,
            texts: [item.artist || 'Unknown Artist'],
            onPress: () => {
              console.log('[App] Android Auto: Selected recent track:', item.title);
              playTrack(item, true);
            },
          })),
        }),
      });
    }
  }, []);

  // Update the Now Playing screen in Android Auto
  const updateNowPlayingScreen = useCallback((track, playing) => {
    if (!track) return;

    const statusIcon = playing ? '▶' : '⏸';
    const statusText = playing ? 'Now Playing' : 'Paused';

    CarProjection.registerScreen({
      name: 'nowPlaying',
      template: createPaneTemplate({
        title: `${statusIcon} ${statusText}`,
        headerAction: {
          title: 'Back',
          onPress: () => {
            CarProjection.popScreen();
          },
        },
        rows: [
          {
            title: track.title,
            texts: [track.artist || 'Unknown Artist'],
          },
          {
            title: playing ? 'Status: Playing' : 'Status: Paused',
            texts: ['Tap Play/Pause to control playback'],
          },
        ],
        actions: [
          {
            title: playing ? '⏸ Pause' : '▶ Play',
            onPress: () => {
              if (isPlayingRef.current) {
                pauseTrack();
              } else {
                resumeTrack();
              }
            },
          },
          {
            title: '⏹ Stop',
            onPress: () => {
              stopTrack();
            },
          },
        ],
      }),
    });
  }, []);

  // Play a track using TrackPlayer
  const playTrack = useCallback(async (track, fromAndroidAuto = false) => {
    console.log('[App] Playing track:', track.title);
    console.log('[App] Player ready:', isPlayerReady);
    console.log('[App] Track URL:', track.mediaUri);
    
    if (!isPlayerReady) {
      console.log('[App] Player not ready yet, setting up...');
      await setupPlayer();
    }
    
    try {
      console.log('[App] Resetting player...');
      await TrackPlayer.reset();
      
      console.log('[App] Adding track to queue...');
      await TrackPlayer.add({
        id: track.id,
        url: track.mediaUri,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        artwork: track.artworkUri,
      });
      
      console.log('[App] Starting playback...');
      await TrackPlayer.play();
      console.log('[App] Playback started successfully');
      
      setCurrentTrack(track);
      currentTrackRef.current = track;

      // Add to recently played
      addToRecentlyPlayed(track);

      // Update Android Auto screens
      updateRecentlyPlayedScreen();
      updateNowPlayingScreen(track, true);

      // Navigate to Now Playing screen if selected from Android Auto
      if (fromAndroidAuto) {
        CarProjection.navigateToScreen('nowPlaying');
      }
    } catch (error) {
      console.log('[App] Error playing track:', error.message || error);
      console.log('[App] Error stack:', error.stack);
    }
  }, [isPlayerReady, addToRecentlyPlayed, updateRecentlyPlayedScreen, updateNowPlayingScreen]);

  // Pause playback
  const pauseTrack = useCallback(async () => {
    console.log('[App] Pausing');
    try {
      await TrackPlayer.pause();
      if (currentTrackRef.current) {
        updateNowPlayingScreen(currentTrackRef.current, false);
      }
    } catch (error) {
      console.error('[App] Error pausing:', error);
    }
  }, [updateNowPlayingScreen]);

  // Resume playback
  const resumeTrack = useCallback(async () => {
    console.log('[App] Resuming');
    try {
      await TrackPlayer.play();
      if (currentTrackRef.current) {
        updateNowPlayingScreen(currentTrackRef.current, true);
      }
    } catch (error) {
      console.error('[App] Error resuming:', error);
    }
  }, [updateNowPlayingScreen]);

  // Stop playback
  const stopTrack = useCallback(async () => {
    console.log('[App] Stopping');
    try {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
      
      setCurrentTrack(null);
      currentTrackRef.current = null;
      
      // Navigate back to main screen
      CarProjection.popToRoot();
    } catch (error) {
      console.error('[App] Error stopping:', error);
    }
  }, []);

  // Initialize Android Auto screens
  useEffect(() => {
    // IMPORTANT: Register "main" screen FIRST so it's the root screen
    // This must be registered before other screens to ensure Android Auto picks it as root
    updateRecentlyPlayedScreen();

    // Register the Browse All screen
    console.log('[App] About to register browse screen, mediaItems length:', mediaItems?.length);
    try {
      CarProjection.registerScreen({
        name: 'browse',
        template: createListTemplate({
          title: 'Browse All',
          headerAction: {
            title: 'Back',
            onPress: () => {
              CarProjection.popScreen();
            },
          },
          actionStrip: [
            {
              title: 'Now Playing',
              onPress: () => {
                console.log('[App] Navigate to Now Playing from Browse');
                CarProjection.navigateToScreen('nowPlaying');
              },
            },
          ],
          items: mediaItems.map((item) => ({
            title: item.title,
            texts: [item.artist || 'Unknown Artist'],
            onPress: () => {
              console.log('[App] Android Auto: Selected track from browse:', item.title);
              playTrack(item, true);
            },
          })),
        }),
      });
      console.log('[App] Browse screen registered successfully');
    } catch (e) {
      console.error('[App] Browse screen registration error:', e);
    }

    // Pre-register the Now Playing screen (will be updated when a track plays)
    CarProjection.registerScreen({
      name: 'nowPlaying',
      template: createPaneTemplate({
        title: 'Now Playing',
        headerAction: {
          title: 'Back',
          onPress: () => {
            CarProjection.popScreen();
          },
        },
        rows: [
          {
            title: 'No track selected',
            texts: ['Select a track to start playing'],
          },
        ],
        actions: [],
      }),
    });

    // Listen for Android Auto connection status
    const sessionStartedSub = CarProjection.addSessionStartedListener(() => {
      console.log('[App] Android Auto session started');
      setIsConnected(true);
      // Refresh screens when connected
      updateRecentlyPlayedScreen();
      
      // Sync the Now Playing screen with current track state (use refs which are always current)
      const track = currentTrackRef.current;
      const playing = isPlayingRef.current;
      console.log('[App] AA connect sync - track:', track?.title, 'playing:', playing);
      if (track) {
        updateNowPlayingScreen(track, playing);
      }
      
      // Also try to get current state from TrackPlayer asynchronously
      (async () => {
        try {
          const activeTrack = await TrackPlayer.getActiveTrack();
          const state = await TrackPlayer.getPlaybackState();
          console.log('[App] AA connect - TrackPlayer activeTrack:', activeTrack?.title, 'state:', state?.state);
          
          if (activeTrack) {
            // Find the matching media item
            const mediaTrack = mediaItems.find(item => item.id === activeTrack.id);
            if (mediaTrack) {
              const isCurrentlyPlaying = state?.state === State.Playing;
              console.log('[App] AA connect - Found matching track:', mediaTrack.title, 'playing:', isCurrentlyPlaying);
              setCurrentTrack(mediaTrack);
              currentTrackRef.current = mediaTrack;
              setIsPlaying(isCurrentlyPlaying);
              isPlayingRef.current = isCurrentlyPlaying;
              updateNowPlayingScreen(mediaTrack, isCurrentlyPlaying);
            }
          }
        } catch (error) {
          console.log('[App] Error getting TrackPlayer state on AA connect:', error?.message || error);
        }
      })();
    });

    const sessionEndedSub = CarProjection.addSessionEndedListener(() => {
      console.log('[App] Android Auto session ended');
      setIsConnected(false);
    });

    // Check initial connection status
    CarProjection.isConnected().then(setIsConnected);

    // Start the Android Auto session
    CarProjection.startSession();

    return () => {
      sessionStartedSub.remove();
      sessionEndedSub.remove();
    };
  }, [playTrack, updateRecentlyPlayedScreen]);

  // Update Now Playing screen when track or playing state changes
  useEffect(() => {
    if (currentTrack) {
      updateNowPlayingScreen(currentTrack, isPlaying);
    }
  }, [currentTrack, isPlaying, updateNowPlayingScreen]);

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTrackPress = (track) => {
    playTrack(track, false);
    // When selected from phone, also navigate Android Auto to Now Playing
    if (isConnected) {
      CarProjection.navigateToScreen('nowPlaying');
    }
  };

  const renderTrackItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.trackItem,
        currentTrack?.id === item.id && styles.trackItemActive
      ]}
      onPress={() => handleTrackPress(item)}
    >
      {item.artworkUri && (
        <Image
          source={{ uri: item.artworkUri }}
          style={styles.artwork}
          resizeMode="cover"
        />
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle}>{item.title}</Text>
        <Text style={styles.trackArtist}>{item.artist || 'Unknown Artist'}</Text>
      </View>
      {currentTrack?.id === item.id && (
        <View style={styles.playingIndicator}>
          <Text style={styles.playingText}>{isPlaying ? '▶' : '⏸'}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderSectionHeader = (title) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Test Android Auto</Text>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, isConnected && styles.statusDotConnected]} />
          <Text style={styles.statusText}>
            {isConnected ? 'Connected to Android Auto' : 'Not Connected'}
          </Text>
        </View>
      </View>

      {/* Recently Played Section */}
      {recentlyPlayed.length > 0 && (
        <View style={styles.section}>
          {renderSectionHeader('Recently Played')}
          <FlatList
            horizontal
            data={recentlyPlayed}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.recentItem,
                  currentTrack?.id === item.id && styles.recentItemActive
                ]}
                onPress={() => handleTrackPress(item)}
              >
                {item.artworkUri && (
                  <Image
                    source={{ uri: item.artworkUri }}
                    style={styles.recentArtwork}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
                {currentTrack?.id === item.id && (
                  <Text style={styles.recentPlaying}>{isPlaying ? '▶' : '⏸'}</Text>
                )}
              </TouchableOpacity>
            )}
            keyExtractor={(item) => `recent-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentList}
          />
        </View>
      )}

      {/* All Media Section */}
      <View style={styles.section}>
        {renderSectionHeader('All Media')}
      </View>
      
      <FlatList
        data={mediaItems}
        renderItem={renderTrackItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />

      {currentTrack && (
        <View style={styles.nowPlayingBar}>
          <TouchableOpacity 
            style={styles.nowPlayingContent}
            onPress={() => isPlaying ? pauseTrack() : resumeTrack()}
          >
            {currentTrack.artworkUri && (
              <Image
                source={{ uri: currentTrack.artworkUri }}
                style={styles.nowPlayingArtwork}
                resizeMode="cover"
              />
            )}
            <View style={styles.nowPlayingInfo}>
              <Text style={styles.nowPlayingText}>
                {currentTrack.title}
              </Text>
              <Text style={styles.nowPlayingArtist}>
                {currentTrack.artist} • {formatTime(progress.position)} / {formatTime(progress.duration || 0)}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.playPauseButton}
              onPress={() => isPlaying ? pauseTrack() : resumeTrack()}
            >
              <Text style={styles.playPauseText}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${progress.duration > 0 ? (progress.position / progress.duration) * 100 : 0}%` }
              ]} 
            />
          </View>
          {isConnected && (
            <Text style={styles.androidAutoIndicator}>
              Now showing on Android Auto
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    backgroundColor: '#1e1e1e',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#666',
    marginRight: 8,
  },
  statusDotConnected: {
    backgroundColor: '#1db954',
  },
  statusText: {
    fontSize: 14,
    color: '#999',
  },
  section: {
    paddingTop: 16,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  recentList: {
    paddingHorizontal: 12,
  },
  recentItem: {
    width: 120,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  recentItemActive: {
    opacity: 1,
  },
  recentArtwork: {
    width: 110,
    height: 110,
    borderRadius: 8,
    marginBottom: 8,
  },
  recentTitle: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
  },
  recentPlaying: {
    fontSize: 16,
    color: '#1db954',
    marginTop: 4,
  },
  listContent: {
    padding: 10,
    paddingBottom: 100,
  },
  trackItem: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  trackItemActive: {
    backgroundColor: '#282828',
    borderWidth: 1,
    borderColor: '#1db954',
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 4,
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  trackArtist: {
    fontSize: 14,
    color: '#999',
  },
  playingIndicator: {
    marginLeft: 10,
  },
  playingText: {
    fontSize: 20,
    color: '#1db954',
  },
  nowPlayingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#282828',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  nowPlayingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  nowPlayingArtwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
  },
  nowPlayingInfo: {
    flex: 1,
  },
  nowPlayingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  nowPlayingArtist: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  playPauseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1db954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseText: {
    fontSize: 18,
    color: '#000',
  },
  androidAutoIndicator: {
    color: '#1db954',
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 8,
    paddingTop: 4,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#444',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1db954',
  },
});

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
  // Track if we need to restart audio when screen becomes visible
  const pendingAudioRestartRef = useRef(null); // Will hold { track, position } if restart is pending
  
  // Keep refs in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Configure MediaBrowserService so Android Auto can route audio when it connects
  useEffect(() => {
    CarProjection.configureMediaSession({
      serviceName: 'com.doublesymmetry.trackplayer.service.MusicService',
    }).catch((err) => console.warn('[App] configureMediaSession:', err?.message));
  }, []);

  // Map TrackPlayer state to CarProjection playback state string
  const playbackStateToString = (state) => {
    if (state === State.Playing) return 'playing';
    if (state === State.Paused) return 'paused';
    if (state === State.Stopped || state === State.Ready || state === State.None) return 'stopped';
    if (state === State.Buffering || state === State.Connecting) return 'buffering';
    if (state === State.Error) return 'error';
    return 'none';
  };

  // Sync our MediaBrowserService MediaSession so Android Auto sees us as the active media source
  const syncMediaSessionState = useCallback(async () => {
    try {
      const [state, progress] = await Promise.all([TrackPlayer.getPlaybackState(), TrackPlayer.getProgress()]);
      const track = currentTrackRef.current;
      await CarProjection.updateMediaPlaybackState({
        state: playbackStateToString(state?.state),
        position: progress?.position ?? 0,
        duration: progress?.duration ?? 0,
        title: track?.title,
        artist: track?.artist,
      });
    } catch (e) {
      // ignore if module or TrackPlayer not ready
    }
  }, []);

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

            if (currentTrackRef.current) {
              updateNowPlayingScreen(currentTrackRef.current, playing);
            }
            syncMediaSessionState();
          }
        );
        
        trackChangedListener = TrackPlayer.addEventListener(
          Event.PlaybackActiveTrackChanged,
          async (event) => {
            console.log('[App] Active track changed:', event);
            if (event.track) {
              const track = mediaItems.find(item => item.id === event.track.id);
              if (track) {
                setCurrentTrack(track);
                currentTrackRef.current = track;
                syncMediaSessionState();
              }
            }
          }
        );
        
        // Listen to progress updates
        progressListener = TrackPlayer.addEventListener(
          Event.PlaybackProgressUpdated,
          (event) => {
            setProgress({ position: event.position, duration: event.duration });
            syncMediaSessionState();
          }
        );
        
        TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
          console.log('[App] Playback error:', event?.message || event?.code || event);
        });
        
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
  }, [syncMediaSessionState]);

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

  // Update the Recently Played screen in Android Auto (secondary screen)
  const updateRecentlyPlayedScreen = useCallback(() => {
    const recent = recentlyPlayedRef.current;
    
    if (recent.length === 0) {
      // Show "Nothing recently played" message
      CarProjection.registerScreen({
        name: 'recentlyPlayed',
        template: createMessageTemplate({
          title: 'Recently Played',
          message: 'Nothing recently played.\n\nSelect something from the media library on your phone to start listening.',
          headerAction: {
            title: 'Back',
            onPress: () => {
              CarProjection.popScreen();
            },
          },
        }),
      });
    } else {
      // Show recently played list
      CarProjection.registerScreen({
        name: 'recentlyPlayed',
        template: createListTemplate({
          title: 'Recently Played',
          headerAction: {
            title: 'Back',
            onPress: () => {
              CarProjection.popScreen();
            },
          },
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

  // Update the main Now Playing screen in Android Auto (this is the root screen)
  const updateNowPlayingScreen = useCallback((track, playing) => {
    if (!track) {
      // No track - show blank state with "Recently Played" button
      CarProjection.registerScreen({
        name: 'main',
        template: createPaneTemplate({
          title: 'Now Playing',
          actionStrip: [
            {
              title: 'Recently Played',
              onPress: () => {
                console.log('[App] Navigate to Recently Played');
                CarProjection.navigateToScreen('recentlyPlayed');
              },
            },
          ],
          rows: [
            {
              title: 'No track playing',
              texts: ['Select something from Recently Played to start listening'],
            },
          ],
          actions: [],
        }),
      });
      return;
    }

    const statusIcon = playing ? '▶' : '⏸';
    const statusText = playing ? 'Now Playing' : 'Paused';

    CarProjection.registerScreen({
      name: 'main',
      template: createPaneTemplate({
        title: `${statusIcon} ${statusText}`,
        actionStrip: [
          {
            title: 'Recently Played',
            onPress: () => {
              console.log('[App] Navigate to Recently Played');
              CarProjection.navigateToScreen('recentlyPlayed');
            },
          },
        ],
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
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/c51db15d-5c6e-4bc6-b2eb-6028cf8cb2e7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:308',message:'playTrack called',data:{trackTitle:track.title,fromAndroidAuto,isPlayerReady},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
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
      
      // #region agent log
      const stateAfterPlay = await TrackPlayer.getPlaybackState();
      fetch('http://127.0.0.1:7246/ingest/c51db15d-5c6e-4bc6-b2eb-6028cf8cb2e7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:340',message:'playTrack - after TrackPlayer.play()',data:{trackTitle:track.title,stateAfterPlay:stateAfterPlay?.state},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      setCurrentTrack(track);
      currentTrackRef.current = track;

      // Add to recently played
      addToRecentlyPlayed(track);

      // Update Android Auto screens
      updateNowPlayingScreen(track, true);
      updateRecentlyPlayedScreen();

      // Go back to main (Now Playing) screen if selected from Android Auto
      if (fromAndroidAuto) {
        CarProjection.popToRoot();
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
      setIsPlaying(false);
      isPlayingRef.current = false;
      
      // Update main screen to show blank state
      updateNowPlayingScreen(null, false);
    } catch (error) {
      console.error('[App] Error stopping:', error);
    }
  }, [updateNowPlayingScreen]);

  // Initialize Android Auto screens
  useEffect(() => {
    // IMPORTANT: Register "main" screen FIRST so it's the root screen
    // Register the main screen (Now Playing) - this is the root screen
    // Start with blank state (no track)
    updateNowPlayingScreen(null, false);
    
    // Register the Recently Played screen (secondary screen)
    updateRecentlyPlayedScreen();

    // With mediaOnly: true the Car App Service is not in the manifest, so this never fires.
    // Connection is via MediaBrowser only → onMediaBrowserConnected below.
    const sessionStartedSub = CarProjection.addSessionStartedListener(() => {
      console.log('[App] Android Auto session started (user opened app on DHU)');
      setIsConnected(true);

      (async () => {
        try {
          const activeTrack = await TrackPlayer.getActiveTrack();
          const state = await TrackPlayer.getPlaybackState();
          const mediaTrack = activeTrack ? mediaItems.find(item => item.id === activeTrack.id) : null;
          const wasPlaying = state?.state === State.Playing;

          if (activeTrack && mediaTrack) {
            setCurrentTrack(mediaTrack);
            currentTrackRef.current = mediaTrack;

            if (wasPlaying) {
              // Was playing on phone: restart to route audio to car (pause → wait → resume).
              const currentPosition = await TrackPlayer.getProgress();
              await TrackPlayer.pause();
              await new Promise((r) => setTimeout(r, 2000));
              if (currentPosition?.position > 0) await TrackPlayer.seekTo(currentPosition.position);
              await TrackPlayer.play();
              setIsPlaying(true);
              isPlayingRef.current = true;
              updateNowPlayingScreen(mediaTrack, true);
            } else {
              // Had track but paused: resume so audio plays when they open app on DHU.
              await TrackPlayer.play();
              setIsPlaying(true);
              isPlayingRef.current = true;
              updateNowPlayingScreen(mediaTrack, true);
            }
            updateRecentlyPlayedScreen();
          } else if (!activeTrack && recentlyPlayedRef.current?.length > 0) {
            // No track: auto-play first recently played so opening app on DHU starts audio.
            console.log('[App] AA session started - no track, auto-playing first recently played');
            const first = recentlyPlayedRef.current[0];
            playTrack(first, true);
          } else {
            updateNowPlayingScreen(null, false);
            updateRecentlyPlayedScreen();
          }
        } catch (error) {
          console.log('[App] Error on AA session start:', error?.message || error);
          updateNowPlayingScreen(null, false);
          updateRecentlyPlayedScreen();
        }
      })();
    });

    const sessionEndedSub = CarProjection.addSessionEndedListener(() => {
      console.log('[App] Android Auto session ended');
      setIsConnected(false);
      // Clear any pending audio restart
      pendingAudioRestartRef.current = null;
    });

    // When Android Auto connects via MediaBrowser: DHU binds to us and calls onGetRoot.
    // With mediaOnly: true this fires when the user taps our app (no Car App). Same flow as Spotify.
    // (1) Sync MediaSession so the car sees state; (2) start or resume playback so audio goes to the car.
    const mediaBrowserConnectedSub = CarProjection.addMediaBrowserConnectedListener(() => {
      console.log('[App] MediaBrowser connected - user selected our app on DHU (or plug-in)');
      setIsConnected(true);
      (async () => {
        try {
          await syncMediaSessionState();

          const activeTrack = await TrackPlayer.getActiveTrack();
          const state = await TrackPlayer.getPlaybackState();
          const wasPlaying = state?.state === State.Playing;
          const mediaTrack = activeTrack ? mediaItems.find((item) => item.id === activeTrack.id) : null;

          if (activeTrack && mediaTrack) {
            setCurrentTrack(mediaTrack);
            currentTrackRef.current = mediaTrack;
            if (wasPlaying) {
              console.log('[App] MediaBrowser connect - restarting playback to route audio to car');
              const progress = await TrackPlayer.getProgress();
              await TrackPlayer.pause();
              await new Promise((r) => setTimeout(r, 2000));
              if (progress?.position > 0) await TrackPlayer.seekTo(progress.position);
              await TrackPlayer.play();
              setIsPlaying(true);
              isPlayingRef.current = true;
              updateNowPlayingScreen(mediaTrack, true);
            } else {
              await TrackPlayer.play();
              setIsPlaying(true);
              isPlayingRef.current = true;
              updateNowPlayingScreen(mediaTrack, true);
            }
            updateRecentlyPlayedScreen();
          } else if (!activeTrack && recentlyPlayedRef.current?.length > 0) {
            console.log('[App] MediaBrowser connect - no track, auto-playing first recently played');
            const first = recentlyPlayedRef.current[0];
            playTrack(first, true);
          } else {
            updateNowPlayingScreen(null, false);
            updateRecentlyPlayedScreen();
          }
          await syncMediaSessionState();
        } catch (e) {
          console.warn('[App] MediaBrowser connect - failed:', e?.message);
        }
      })();
    });

    // Car sent Play (e.g. user taps Play on DHU). Resume or start playback.
    const mediaPlaySub = CarProjection.addMediaPlayListener(() => {
      console.log('[App] Car sent Play command');
      (async () => {
        try {
          if (currentTrackRef.current && !isPlayingRef.current) {
            await resumeTrack();
          } else if (!currentTrackRef.current && recentlyPlayedRef.current?.length > 0) {
            playTrack(recentlyPlayedRef.current[0], true);
          }
        } catch (e) {
          console.warn('[App] onMediaPlay handler error:', e?.message);
        }
      })();
    });

    const mediaPauseSub = CarProjection.addMediaPauseListener(() => {
      console.log('[App] Car sent Pause command');
      pauseTrack().catch((e) => console.warn('[App] onMediaPause error:', e?.message));
    });

    const mediaStopSub = CarProjection.addMediaStopListener(() => {
      console.log('[App] Car sent Stop command');
      stopTrack().catch((e) => console.warn('[App] onMediaStop error:', e?.message));
    });

    // Listen for screen changes - for logging/debugging
    const screenChangedSub = CarProjection.addScreenChangedListener((screenName) => {
      console.log('[App] Android Auto screen changed to:', screenName);
    });

    // Check initial connection status
    CarProjection.isConnected().then(setIsConnected);

    // Start the Android Auto session
    CarProjection.startSession();

    return () => {
      sessionStartedSub.remove();
      sessionEndedSub.remove();
      mediaBrowserConnectedSub.remove();
      mediaPlaySub.remove();
      mediaPauseSub.remove();
      mediaStopSub.remove();
      screenChangedSub.remove();
    };
  }, [playTrack, pauseTrack, resumeTrack, stopTrack, updateRecentlyPlayedScreen, updateNowPlayingScreen]);

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

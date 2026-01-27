import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import CarProjection, { createListTemplate, createMessageTemplate } from 'react-native-car-projection';

export default function App() {

  useEffect(() => {
    console.log('CarProjection', CarProjection.registerScreen);
  }, [])

  useEffect(() => {
    // Register the root screen (main menu)
    CarProjection.registerScreen({
      name: 'root',
      template: createListTemplate({
        title: 'Test App',
        header: 'Android Auto Test',
        items: [
          {
            title: 'Go to Details',
            texts: ['View item details'],
            onPress: () => {
              console.log('Navigating to details screen');
              // Navigate to the details screen when this item is tapped
              CarProjection.navigateToScreen('details', { itemId: 1 });
            }
          },
          {
            title: 'Go to Settings',
            texts: ['App settings'],
            onPress: () => {
              console.log('Navigating to settings screen');
              // Navigate to the settings screen when this item is tapped
              CarProjection.navigateToScreen('settings');
            }
          },
          {
            title: 'Show Message',
            texts: ['Display a message template'],
            onPress: () => {
              console.log('Navigating to message screen');
              CarProjection.navigateToScreen('message');
            }
          }
        ]
      })
    });

    // Register a details screen
    CarProjection.registerScreen({
      name: 'details',
      template: createListTemplate({
        title: 'Item Details',
        header: 'Details Screen',
        items: [
          {
            title: 'Detail Item 1',
            texts: ['This is detail information'],
            onPress: () => {
              console.log('Detail item 1 pressed');
            }
          },
          {
            title: 'Detail Item 2',
            texts: ['More details here'],
            onPress: () => {
              console.log('Detail item 2 pressed');
            }
          },
          {
            title: 'Back to Main',
            texts: ['Return to main menu'],
            onPress: () => {
              console.log('Going back to root');
              // Go back to the root screen
              CarProjection.popToRoot();
            }
          }
        ]
      })
    });

    // Register a settings screen
    CarProjection.registerScreen({
      name: 'settings',
      template: createListTemplate({
        title: 'Settings',
        header: 'App Settings',
        items: [
          {
            title: 'Setting 1',
            texts: ['First setting option'],
            onPress: () => {
              console.log('Setting 1 pressed');
            }
          },
          {
            title: 'Setting 2',
            texts: ['Second setting option'],
            onPress: () => {
              console.log('Setting 2 pressed');
            }
          },
          {
            title: 'Back',
            texts: ['Go back'],
            onPress: () => {
              console.log('Going back');
              // Go back one screen
              CarProjection.popScreen();
            }
          }
        ]
      })
    });

    // Register a message screen (using MessageTemplate)
    CarProjection.registerScreen({
      name: 'message',
      template: createMessageTemplate({
        title: 'Message Screen',
        message: 'This is a message template! You can use this to display information or confirmations.',
        headerAction: {
          title: 'Back',
          onPress: () => {
            console.log('Going back from message');
            CarProjection.popScreen();
          }
        }
      })
    });

    // Start the Android Auto session
    CarProjection.startSession();

    // Listen for events
    const screenSub = CarProjection.addScreenChangedListener((screenName) => {
      console.log('✅ Screen changed to:', screenName);
      console.log('✅ onScreenChanged event WAS RECEIVED - this proves events work!');
    });

    const sessionSub = CarProjection.addSessionStartedListener(() => {
      console.log('✅ Android Auto session started!');
    });

    // Listen for test events - simplest possible test
    console.log('[APP] Setting up test listener...');
    const testEventSub = CarProjection.addTestEventListener((message) => {
      console.log('✅✅✅ [APP] TEST EVENT RECEIVED:', message);
    });
    console.log('[APP] ✓ Listener set up');

    // Send test event - simplest test
    setTimeout(() => {
      console.log('[APP] Sending test event...');
      CarProjection.sendTestEvent('AVOCADOOOOOOOOOOOOOO')
        .then(() => {
          console.log('[APP] ✓ Sent. Look for "🎉 [TEST] *** EVENT RECEIVED ***" above.');
        })
        .catch((error) => {
          console.error('[APP] ❌ Error:', error);
        });
    }, 3000);

    return () => {
      screenSub.remove();
      sessionSub.remove();
      testEventSub.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Android Auto Module Test</Text>
      <Text style={styles.subtext}>
        Connect to Android Auto to see the test screen
      </Text> 
      <Text style={styles.text}>App Test</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
});

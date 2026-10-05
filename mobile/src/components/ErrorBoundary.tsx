import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Updates from "expo-updates";
import { colors } from "../theme/colors";
import { captureError } from "../lib/telemetry";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence: a rendering error shows a branded "something went
 * wrong" screen with a reload button instead of a blank white app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, { componentStack: info.componentStack });
  }

  private reload = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Not available in development; just try rendering again.
      this.setState({ error: null });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected problem. Your bag is safe. Reload to carry on.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={this.reload}
          accessibilityRole="button"
          accessibilityLabel="Reload the app"
        >
          <Text style={styles.buttonText}>RELOAD</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.primary, marginBottom: 12 },
  body: { fontSize: 15, textAlign: "center", color: colors.textSecondary, marginBottom: 24, lineHeight: 22 },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 4,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700", letterSpacing: 1.5 },
});

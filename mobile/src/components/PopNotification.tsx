import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export type PopNotificationData = {
  id?: string;
  type?: "success" | "info" | "warning" | "error";
  title: string;
  message?: string;
  icon?: keyof typeof Feather.glyphMap;
  duration?: number;
};

type Props = {
  notification: PopNotificationData | null;
  onDismiss: () => void;
  /** Tapping the body runs this instead of just dismissing. */
  onPress?: () => void;
};

const { width } = Dimensions.get("window");

export function PopNotification({ notification, onDismiss, onPress }: Props) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(onDismiss);
  }, [onDismiss, opacity, translateY]);

  useEffect(() => {
    if (notification) {
      // Animate in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        dismiss();
      }, notification.duration || 3200);

      return () => clearTimeout(timer);
    } else {
      translateY.setValue(-120);
      opacity.setValue(0);
    }
  }, [dismiss, notification, opacity, translateY]);

  if (!notification) return null;

  const type = notification.type || "success";

  const getTheme = () => {
    switch (type) {
      case "error":
        return {
          bg: "#4A181E",
          border: "#852632",
          iconColor: "#FF8594",
          defaultIcon: "alert-circle" as const,
        };
      case "warning":
        return {
          bg: "#3D2B10",
          border: "#805B20",
          iconColor: "#FFD07A",
          defaultIcon: "alert-triangle" as const,
        };
      case "info":
        return {
          bg: "#182635",
          border: "#284A6E",
          iconColor: "#7EC4FF",
          defaultIcon: "info" as const,
        };
      case "success":
      default:
        return {
          bg: colors.darkCard || "#24201D",
          border: colors.primary || "#C5A880",
          iconColor: colors.primaryLight || "#E8D8C3",
          defaultIcon: "check-circle" as const,
        };
    }
  };

  const theme = getTheme();
  const iconName = notification.icon || theme.defaultIcon;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress ?? dismiss}
        accessibilityRole="alert"
        style={[
          styles.card,
          {
            backgroundColor: theme.bg,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={[styles.iconWrap, { borderColor: theme.border }]}>
          <Feather name={iconName} size={18} color={theme.iconColor} />
        </View>

        <View style={styles.contentWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {notification.title}
          </Text>
          {notification.message ? (
            <Text style={styles.message} numberOfLines={2}>
              {notification.message}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={16} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: width - 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  contentWrap: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    lineHeight: 16,
  },
});

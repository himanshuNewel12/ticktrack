import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Tabs } from "expo-router";
import { ColorValue, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme";

export default function TabLayout() {
  const { colors } = useTheme();
  const useNative = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
  if (useNative) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="tasks"><NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: "checkmark", selected: "checkmark" }} /></NativeTabs.Trigger>
        <NativeTabs.Trigger name="calendar"><NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} /></NativeTabs.Trigger>
        <NativeTabs.Trigger name="search"><NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} /></NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings"><NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} /></NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brandPrimary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { ...(Platform.OS === "web" ? { height: 64 } : {}) }, tabBarItemStyle: { alignSelf: "center" } }}>
      <Tabs.Screen name="tasks" options={{ title: "Tasks", tabBarIcon: ({ color, size }) => <TabIcon name="checkmark-sharp" color={color} size={size} /> }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: ({ color, size, focused }) => <CalendarTabIcon color={color} size={size} focused={focused} background={colors.brandPrimary} onBrand={colors.onBrandPrimary} /> }} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color, size }) => <TabIcon name="search-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, size }) => <TabIcon name="settings-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="today" options={{ href: null }} />
      <Tabs.Screen name="focus" options={{ href: null }} />
      <Tabs.Screen name="habits" options={{ href: null }} />
    </Tabs>
  );
}

function TabIcon({ name, color, size }: { name: "checkmark-sharp" | "search-outline" | "settings-outline"; color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color} size={size} />;
}

function CalendarTabIcon({ color, size, focused, background, onBrand }: { color: ColorValue; size: number; focused: boolean; background: string; onBrand: string }) {
  const day = new Date().getDate();
  const stroke = String(color);
  return (
    <View style={[styles.calendarIcon, { width: size, height: size, borderRadius: 6, borderColor: stroke }, focused && { backgroundColor: background, borderColor: background }]}>
      <Text style={[styles.calendarDay, { color: focused ? onBrand : stroke, fontSize: size * 0.55 }]}>{day}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarIcon: { borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  calendarDay: { fontWeight: "700", lineHeight: undefined },
});

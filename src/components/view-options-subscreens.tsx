import React, { useState, useRef, ComponentType } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Modal,
  TextInput,
  GestureResponderEvent,
  StyleSheet,
} from "react-native";
import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";

type LooseIconProps = { name: string; size: number; color?: string };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

/* ============================================================================
   COLOR CONVERSION HELPERS
   ============================================================================ */
export function hexToRgb(hex: string) {
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("");
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number) {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ============================================================================
   CUSTOM GRADIENT SLIDER
   ============================================================================ */
function GradientSlider({
  label,
  value,
  onChange,
  gradientColors,
  colors,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  gradientColors: [string, string, ...string[]];
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const trackWidthRef = useRef(200);

  const handleTouch = (evt: GestureResponderEvent) => {
    const x = evt.nativeEvent.locationX;
    const clampedX = Math.max(0, Math.min(x, trackWidthRef.current));
    const pct = trackWidthRef.current > 0 ? clampedX / trackWidthRef.current : 0;
    const val = Math.round(pct * 255);
    onChange(val);
  };

  const pct = Math.max(0, Math.min(100, (value / 255) * 100));

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{ flex: 1, height: 32, justifyContent: "center" }}
          onLayout={(e) => {
            trackWidthRef.current = e.nativeEvent.layout.width;
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleTouch}
          onResponderMove={handleTouch}
        >
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 16, borderRadius: 8, width: "100%" }}
          />
          <View
            style={{
              position: "absolute",
              left: `${pct}%`,
              marginLeft: -14,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: "#D1D5DB",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 4,
            }}
          />
        </View>
        <View
          style={{
            width: 54,
            height: 36,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <TextInput
            style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600", textAlign: "center", padding: 0 }}
            keyboardType="number-pad"
            maxLength={3}
            value={String(value)}
            onChangeText={(txt) => {
              const num = parseInt(txt || "0", 10);
              if (!isNaN(num)) onChange(Math.max(0, Math.min(255, num)));
            }}
          />
        </View>
      </View>
    </View>
  );
}

/* ============================================================================
   CUSTOM COLOR PICKER MODAL (Screenshot 5)
   ============================================================================ */
export function CustomColorPickerModal({
  visible,
  initialHex,
  onSelectColor,
  onClose,
}: {
  visible: boolean;
  initialHex: string;
  onSelectColor: (hex: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const initialRgb = hexToRgb(initialHex || "#FFFFFF");
  const [r, setR] = useState(initialRgb.r);
  const [g, setG] = useState(initialRgb.g);
  const [b, setB] = useState(initialRgb.b);
  const [hexInput, setHexInput] = useState((initialHex || "#FFFFFF").replace("#", "").toUpperCase());

  const currentRgbString = `rgb(${r}, ${g}, ${b})`;

  const updateR = (val: number) => {
    setR(val);
    setHexInput(rgbToHex(val, g, b).replace("#", ""));
  };
  const updateG = (val: number) => {
    setG(val);
    setHexInput(rgbToHex(r, val, b).replace("#", ""));
  };
  const updateB = (val: number) => {
    setB(val);
    setHexInput(rgbToHex(r, g, val).replace("#", ""));
  };

  const handleHexChange = (text: string) => {
    const clean = text.replace(/[^0-9A-Fa-f]/g, "").toUpperCase().slice(0, 6);
    setHexInput(clean);
    if (clean.length === 6) {
      const rgb = hexToRgb(`#${clean}`);
      setR(rgb.r);
      setG(rgb.g);
      setB(rgb.b);
    }
  };

  const handleConfirm = () => {
    onSelectColor(`#${hexInput.padStart(6, "F")}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => {}} style={[styles.bottomSheetCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Custom Color</Text>

          {/* Red Slider */}
          <GradientSlider
            label="Red"
            value={r}
            onChange={updateR}
            gradientColors={[`rgb(0, ${g}, ${b})`, `rgb(255, ${g}, ${b})`]}
            colors={colors}
          />

          {/* Green Slider */}
          <GradientSlider
            label="Green"
            value={g}
            onChange={updateG}
            gradientColors={[`rgb(${r}, 0, ${b})`, `rgb(${r}, 255, ${b})`]}
            colors={colors}
          />

          {/* Blue Slider */}
          <GradientSlider
            label="Blue"
            value={b}
            onChange={updateB}
            gradientColors={[`rgb(${r}, ${g}, 0)`, `rgb(${r}, ${g}, 255)`]}
            colors={colors}
          />

          {/* Bottom Controls Row */}
          <View style={styles.customPickerBottomRow}>
            {/* Color Preview Swatch */}
            <View style={[styles.customColorSwatch, { backgroundColor: currentRgbString, borderColor: colors.border }]} />

            {/* Hex Display / Input */}
            <View style={[styles.hexInputContainer, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>#</Text>
              <TextInput
                style={[styles.hexTextInput, { color: colors.onSurface }]}
                value={hexInput}
                onChangeText={handleHexChange}
                maxLength={6}
                autoCapitalize="characters"
              />
            </View>

            {/* OK Button */}
            <Pressable onPress={handleConfirm} style={[styles.okButton, { backgroundColor: colors.brandPrimary }]}>
              <Text style={[styles.okButtonText, { color: colors.onBrandPrimary }]}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============================================================================
   COLOR SCREEN (Screenshot 1)
   ============================================================================ */
export function ColorScreen({
  colorBy,
  setColorBy,
  lists,
  listColors,
  onSelectList,
  onBack,
}: {
  colorBy: "List" | "Priority" | "Tag";
  setColorBy: (val: "List" | "Priority" | "Tag") => void;
  lists: any[];
  listColors: Record<string, string>;
  onSelectList: (listId: string, name: string) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);

  const defaultLists = lists && lists.length > 0 ? lists : [
    { id: "inbox", name: "Inbox", emoji: "📥", color: "#3B82F6" },
    { id: "work", name: "Work", emoji: "💼", color: "#3B82F6" },
    { id: "vv", name: "vv", emoji: "≡", color: "#3B82F6" },
    { id: "welcome", name: "Welcome", emoji: "👋", color: "#3B82F6" },
    { id: "personal", name: "Personal", emoji: "🏠", color: "#3B82F6" },
  ];

  return (
    <View style={[styles.fullScreen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.divider }]}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Color</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Card 1: Color By Dropdown */}
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          <Pressable onPress={() => setShowDropdown(!showDropdown)} style={styles.row}>
            <Text style={[styles.cardLabel, { color: colors.onSurface }]}>Color By</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{colorBy}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </View>
          </Pressable>

          {showDropdown ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingVertical: 4 }}>
              {(["List", "Priority", "Tag"] as const).map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => {
                    setColorBy(opt);
                    setShowDropdown(false);
                  }}
                  style={{ paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between" }}
                >
                  <Text style={{ color: colorBy === opt ? colors.brandPrimary : colors.onSurface, fontWeight: colorBy === opt ? "700" : "400" }}>{opt}</Text>
                  {colorBy === opt ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={[styles.subtext, { color: colors.muted }]}>
          Tasks are shown in their list color (to ensure text clarity, colors will be slightly toned down).
        </Text>

        {/* Card 2: List Items with Color Indicators */}
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          {defaultLists.map((item, idx) => {
            const listColor = listColors[item.id] || item.color || "#3B82F6";
            return (
              <React.Fragment key={item.id || idx}>
                {idx > 0 ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
                <Pressable onPress={() => onSelectList(item.id, item.name)} style={styles.row}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 18 }}>{item.emoji || "📁"}</Text>
                    <Text style={[styles.cardLabel, { color: colors.onSurface }]}>{item.name}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: listColor }} />
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ============================================================================
   COLOR PICK SCREEN (Screenshot 3)
   ============================================================================ */
export function ColorPickScreen({
  targetName,
  selectedColor,
  onSelectColor,
  onBack,
}: {
  targetName: string;
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [customModalVisible, setCustomModalVisible] = useState(false);

  const palettes = [
    {
      title: "Suggested",
      swatches: [
        { hex: "none", isNone: true },
        { hex: "#F44336" },
        { hex: "#FF9800" },
        { hex: "#FFEB3B" },
        { hex: "#8BC34A" },
        { hex: "#4CAF50" },
        { hex: "#2196F3" },
        { hex: "#9C27B0" },
      ],
    },
    {
      title: "Macaron",
      swatches: [
        { hex: "#FF9AA2" },
        { hex: "#FFB7B2" },
        { hex: "#FFDAC1" },
        { hex: "#E2F0CB" },
        { hex: "#B5EAD7" },
        { hex: "#C7CEEA" },
        { hex: "#D8B4E2" },
        { hex: "#F49AC2" },
      ],
    },
    {
      title: "Morandi",
      swatches: [
        { hex: "#C87D55" },
        { hex: "#E6B87D" },
        { hex: "#C6D166" },
        { hex: "#99B898" },
        { hex: "#74BDCB" },
        { hex: "#84A9AC" },
        { hex: "#9B88B3" },
        { hex: "#B86B77" },
      ],
    },
    {
      title: "Rococo",
      swatches: [
        { hex: "#B26A6A" },
        { hex: "#D98832" },
        { hex: "#D9C36C" },
        { hex: "#6DA58A" },
        { hex: "#4A9F8E" },
        { hex: "#3B7EA1" },
        { hex: "#757999" },
        { hex: "#B87B83" },
      ],
    },
    {
      title: "Classic",
      swatches: [
        { hex: "#EE5253" },
        { hex: "#FF9F43" },
        { hex: "#FECA57" },
        { hex: "#1DD1A1" },
        { hex: "#10AC84" },
        { hex: "#48DBFB" },
        { hex: "#5F27CD" },
        { hex: "#E84393" },
      ],
    },
    {
      title: "Memphis",
      swatches: [
        { hex: "#FF0000" },
        { hex: "#FF6B6B" },
        { hex: "#FFD93D" },
        { hex: "#00E676" },
        { hex: "#00BCD4" },
        { hex: "#536DFE" },
        { hex: "#C77DFF" },
        { hex: "#FF5252" },
      ],
    },
  ];

  return (
    <View style={[styles.fullScreen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.divider }]}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Color Pick</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Swatches Card */}
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, padding: 16 }]}>
          {palettes.map((cat, pIdx) => (
            <View key={cat.title} style={{ marginBottom: pIdx === palettes.length - 1 ? 0 : 16 }}>
              <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: "600", marginBottom: 10 }}>{cat.title}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {cat.swatches.map((s, sIdx) => {
                  const isSel = (selectedColor || "").toUpperCase() === s.hex.toUpperCase();
                  if (s.isNone) {
                    return (
                      <Pressable
                        key={sIdx}
                        onPress={() => {
                          onSelectColor("#3B82F6");
                          onBack();
                        }}
                        style={[
                          styles.swatchCircle,
                          { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
                        ]}
                      >
                        <Ionicons name="ban-outline" size={20} color="#F44336" />
                      </Pressable>
                    );
                  }
                  return (
                    <Pressable
                      key={sIdx}
                      onPress={() => {
                        onSelectColor(s.hex);
                        onBack();
                      }}
                      style={[
                        styles.swatchCircle,
                        { backgroundColor: s.hex },
                        isSel && { borderWidth: 2.5, borderColor: colors.brandPrimary },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Custom Section Card */}
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, padding: 16 }]}>
          <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: "600", marginBottom: 12 }}>Custom</Text>
          <Pressable
            onPress={() => setCustomModalVisible(true)}
            style={[styles.swatchCircle, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }]}
          >
            <Ionicons name="add" size={22} color={colors.brandPrimary} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Custom Color Picker Modal */}
      <CustomColorPickerModal
        visible={customModalVisible}
        initialHex={selectedColor || "#3B82F6"}
        onSelectColor={(hex) => {
          onSelectColor(hex);
          onBack();
        }}
        onClose={() => setCustomModalVisible(false)}
      />
    </View>
  );
}

/* ============================================================================
   STYLE SCREEN (Screenshot 4)
   ============================================================================ */
export function StyleScreen({
  itemStyle,
  setItemStyle,
  showHeatmap,
  setShowHeatmap,
  onNavigateShowItemIcons,
  onBack,
}: {
  itemStyle: "modern" | "classic";
  setItemStyle: (style: "modern" | "classic") => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  onNavigateShowItemIcons: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.fullScreen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.divider }]}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Style</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Section 1: Item Style */}
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Item Style</Text>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          {/* Visual Previews */}
          <View style={{ flexDirection: "row", gap: 12, padding: 16 }}>
            {/* Modern Card Preview */}
            <Pressable onPress={() => setItemStyle("modern")} style={{ flex: 1, alignItems: "center" }}>
              <View style={[styles.previewCardBox, { backgroundColor: colors.surface, borderColor: itemStyle === "modern" ? colors.brandPrimary : colors.border }]}>
                <Text style={{ color: colors.muted, fontSize: 9, marginBottom: 4 }}>09:00</Text>
                <View style={{ backgroundColor: "#DBEAFE", borderRadius: 6, padding: 6, marginBottom: 6 }}>
                  <Text style={{ color: "#1E40AF", fontSize: 10, fontWeight: "600" }}>Task</Text>
                  <Text style={{ color: "#3B82F6", fontSize: 8 }}>09:00-10:00</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 9, marginBottom: 4 }}>10:00</Text>
                <View style={{ backgroundColor: "#FEF3C7", borderRadius: 6, padding: 6 }}>
                  <Text style={{ color: "#92400E", fontSize: 10, fontWeight: "600" }}>Event</Text>
                  <Text style={{ color: "#D97706", fontSize: 8 }}>10:00-11:00</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Ionicons
                  name={itemStyle === "modern" ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={itemStyle === "modern" ? colors.brandPrimary : colors.muted}
                />
                <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>Modern</Text>
              </View>
            </Pressable>

            {/* Classic Card Preview */}
            <Pressable onPress={() => setItemStyle("classic")} style={{ flex: 1, alignItems: "center" }}>
              <View style={[styles.previewCardBox, { backgroundColor: colors.surface, borderColor: itemStyle === "classic" ? colors.brandPrimary : colors.border }]}>
                <Text style={{ color: colors.muted, fontSize: 9, marginBottom: 4 }}>09:00</Text>
                <View style={{ borderLeftWidth: 3, borderLeftColor: "#3B82F6", backgroundColor: colors.surfaceSecondary, padding: 6, borderRadius: 4, marginBottom: 6 }}>
                  <Text style={{ color: colors.onSurface, fontSize: 10, fontWeight: "600" }}>Task</Text>
                  <Text style={{ color: colors.muted, fontSize: 8 }}>09:00-10:00</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 9, marginBottom: 4 }}>10:00</Text>
                <View style={{ borderLeftWidth: 3, borderLeftColor: "#F59E0B", backgroundColor: colors.surfaceSecondary, padding: 6, borderRadius: 4 }}>
                  <Text style={{ color: colors.onSurface, fontSize: 10, fontWeight: "600" }}>Event</Text>
                  <Text style={{ color: colors.muted, fontSize: 8 }}>10:00-11:00</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Ionicons
                  name={itemStyle === "classic" ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={itemStyle === "classic" ? colors.brandPrimary : colors.muted}
                />
                <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>Classic</Text>
              </View>
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Show Item Icons Nav Button */}
          <Pressable onPress={onNavigateShowItemIcons} style={styles.row}>
            <Text style={[styles.cardLabel, { color: colors.onSurface }]}>Show Item Icons</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={[styles.subtext, { color: colors.muted }]}>
          Choose a style for tasks and other items, and customize icon visibility for each type.
        </Text>

        {/* Section 2: Heatmap */}
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 8 }}>Heatmap</Text>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={{ flexDirection: "row", gap: 12, padding: 16 }}>
            {/* Hide Heatmap Preview */}
            <Pressable onPress={() => setShowHeatmap(false)} style={{ flex: 1, alignItems: "center" }}>
              <View style={[styles.previewCardBox, { backgroundColor: colors.surface, borderColor: !showHeatmap ? colors.brandPrimary : colors.border }]}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                  {Array.from({ length: 15 }, (_, i) => (
                    <View key={i} style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 7, color: colors.muted }}>{i + 1}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Ionicons
                  name={!showHeatmap ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={!showHeatmap ? colors.brandPrimary : colors.muted}
                />
                <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>Hide</Text>
              </View>
            </Pressable>

            {/* Show Heatmap Preview */}
            <Pressable onPress={() => setShowHeatmap(true)} style={{ flex: 1, alignItems: "center" }}>
              <View style={[styles.previewCardBox, { backgroundColor: colors.surface, borderColor: showHeatmap ? colors.brandPrimary : colors.border }]}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                  {Array.from({ length: 15 }, (_, i) => {
                    const isHeat = [1, 2, 5, 8, 11, 13, 14].includes(i);
                    return (
                      <View
                        key={i}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          backgroundColor: isHeat ? "#60A5FA" : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 7, color: isHeat ? "#FFFFFF" : colors.muted }}>{i + 1}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Ionicons
                  name={showHeatmap ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={showHeatmap ? colors.brandPrimary : colors.muted}
                />
                <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>Show</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.subtext, { color: colors.muted }]}>
          Show a heatmap of all items by quantity in the yearly view.
        </Text>
      </ScrollView>
    </View>
  );
}

/* ============================================================================
   SHOW ITEM ICONS SCREEN (Screenshot 2)
   ============================================================================ */
export function ShowItemIconsScreen({
  showTaskIcon,
  setShowTaskIcon,
  showCalendarIcon,
  setShowCalendarIcon,
  showNoteIcon,
  setShowNoteIcon,
  showFocusRecordsIcon,
  setShowFocusRecordsIcon,
  onBack,
}: {
  showTaskIcon: boolean;
  setShowTaskIcon: (val: boolean) => void;
  showCalendarIcon: boolean;
  setShowCalendarIcon: (val: boolean) => void;
  showNoteIcon: boolean;
  setShowNoteIcon: (val: boolean) => void;
  showFocusRecordsIcon: boolean;
  setShowFocusRecordsIcon: (val: boolean) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.fullScreen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.divider }]}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Show Item Icons</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={[styles.subtext, { color: colors.muted }]}>
          Icons can be shown or hidden by type to help you quickly distinguish content. When Task is enabled, you can quickly complete tasks by tapping the checkbox, which automatically hides when space is limited.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          {/* Task */}
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="checkbox-outline" size={20} color={colors.onSurface} />
              <Text style={[styles.cardLabel, { color: colors.onSurface }]}>Task</Text>
            </View>
            <Switch value={showTaskIcon} onValueChange={setShowTaskIcon} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Calendar */}
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="calendar-outline" size={20} color={colors.onSurface} />
              <Text style={[styles.cardLabel, { color: colors.onSurface }]}>Calendar</Text>
            </View>
            <Switch value={showCalendarIcon} onValueChange={setShowCalendarIcon} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Note */}
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="document-text-outline" size={20} color={colors.onSurface} />
              <Text style={[styles.cardLabel, { color: colors.onSurface }]}>Note</Text>
            </View>
            <Switch value={showNoteIcon} onValueChange={setShowNoteIcon} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Focus Records */}
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="timer-outline" size={20} color={colors.onSurface} />
              <Text style={[styles.cardLabel, { color: colors.onSurface }]}>Focus Records</Text>
            </View>
            <Switch value={showFocusRecordsIcon} onValueChange={setShowFocusRecordsIcon} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ============================================================================
   STYLES
   ============================================================================ */
const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 8,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  subtext: {
    fontSize: 12,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  swatchCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  bottomSheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
  },
  customPickerBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  customColorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  hexInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 4,
  },
  hexTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    padding: 0,
  },
  okButton: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  okButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  previewCardBox: {
    width: "100%",
    height: 110,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    justifyContent: "center",
  },
});

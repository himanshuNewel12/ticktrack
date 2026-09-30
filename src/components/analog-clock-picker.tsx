import { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

type Props = {
  value: string | null;
  onChange: (time: string | null) => void;
};

export function AnalogClockPicker({ value, onChange }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  const initialH24 = value ? parseInt(value.split(":")[0], 10) : 9;
  const initialM = value ? parseInt(value.split(":")[1] ?? "0", 10) : 0;

  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const [isPm, setIsPm] = useState(initialH24 >= 12);
  const [hour12, setHour12] = useState(() => {
    const h = initialH24 % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState(initialM);

  useEffect(() => {
    if (value) {
      const h24 = parseInt(value.split(":")[0], 10);
      const m = parseInt(value.split(":")[1] ?? "0", 10);
      setIsPm(h24 >= 12);
      const h = h24 % 12;
      setHour12(h === 0 ? 12 : h);
      setMinute(m);
    }
  }, [value]);

  const emitChange = (h12: number, min: number, pm: boolean) => {
    let h24 = h12 % 12;
    if (pm) h24 += 12;
    const hStr = String(h24).padStart(2, "0");
    const mStr = String(min).padStart(2, "0");
    onChange(`${hStr}:${mStr}`);
  };

  const handleSelectHour = (h: number) => {
    setHour12(h);
    emitChange(h, minute, isPm);
    setMode("minute");
  };

  const handleSelectMinute = (m: number) => {
    setMinute(m);
    emitChange(hour12, m, isPm);
  };

  const handleTogglePm = (pm: boolean) => {
    setIsPm(pm);
    emitChange(hour12, minute, pm);
  };

  const SIZE = 240;
  const CENTER = SIZE / 2; // 120
  const RADIUS = 88;
  const HAND_LEN = 74;
  const NODE_SIZE = 36;

  // Exact angle in degrees (-90deg is top / 12 o'clock)
  const angleDeg = mode === "hour" ? hour12 * 30 - 90 : minute * 6 - 90;

  return (
    <View style={styles.container}>
      {/* Header Display */}
      <View style={styles.headerDisplay}>
        <View style={styles.timeBoxGroup}>
          <Pressable
            onPress={() => setMode("hour")}
            style={[styles.timeBox, mode === "hour" && styles.timeBoxActive]}
          >
            <Text style={[styles.timeBoxText, mode === "hour" && styles.timeBoxTextActive]}>
              {String(hour12).padStart(2, "0")}
            </Text>
          </Pressable>

          <Text style={styles.timeColon}>:</Text>

          <Pressable
            onPress={() => setMode("minute")}
            style={[styles.timeBox, mode === "minute" && styles.timeBoxActive]}
          >
            <Text style={[styles.timeBoxText, mode === "minute" && styles.timeBoxTextActive]}>
              {String(minute).padStart(2, "0")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.amPmGroup}>
          <Pressable
            onPress={() => handleTogglePm(false)}
            style={[styles.amPmPill, !isPm && styles.amPmPillActive]}
          >
            <Text style={[styles.amPmPillText, !isPm && styles.amPmPillTextActive]}>AM</Text>
          </Pressable>
          <Pressable
            onPress={() => handleTogglePm(true)}
            style={[styles.amPmPill, isPm && styles.amPmPillActive]}
          >
            <Text style={[styles.amPmPillText, isPm && styles.amPmPillTextActive]}>PM</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.instructionHint}>
        {mode === "hour" ? "Tap an hour to select" : "Tap a minute to select"}
      </Text>

      {/* Clock Face Dial */}
      <View style={[styles.clockFace, { width: SIZE, height: SIZE, borderRadius: CENTER }]}>
        {/* Clock Hand Pivot Container centered at (CENTER, CENTER) */}
        <View
          style={{
            position: "absolute",
            left: CENTER - HAND_LEN,
            top: CENTER - 1.5,
            width: HAND_LEN * 2,
            height: 3,
            justifyContent: "center",
            alignItems: "flex-end",
            transform: [{ rotate: `${angleDeg}deg` }],
            zIndex: 5,
          }}
        >
          <View
            style={{
              width: HAND_LEN,
              height: 3,
              backgroundColor: colors.brandPrimary,
              borderTopLeftRadius: 1.5,
              borderBottomLeftRadius: 1.5,
            }}
          />
        </View>

        {/* Center Pivot Point Dot */}
        <View
          style={[
            styles.centerDot,
            { left: CENTER - 6, top: CENTER - 6, width: 12, height: 12, borderRadius: 6 },
          ]}
        />

        {/* Clock Nodes */}
        {mode === "hour"
          ? Array.from({ length: 12 }, (_, idx) => idx + 1).map((val) => {
              const rad = (val * 30 - 90) * (Math.PI / 180);
              const x = CENTER + RADIUS * Math.cos(rad) - NODE_SIZE / 2;
              const y = CENTER + RADIUS * Math.sin(rad) - NODE_SIZE / 2;
              const isSelected = hour12 === val;

              return (
                <Pressable
                  key={`h-${val}`}
                  onPress={() => handleSelectHour(val)}
                  style={[
                    styles.node,
                    { left: x, top: y, width: NODE_SIZE, height: NODE_SIZE, borderRadius: NODE_SIZE / 2 },
                    isSelected && styles.nodeSelected,
                  ]}
                >
                  <Text style={[styles.nodeText, isSelected && styles.nodeTextSelected]}>
                    {val}
                  </Text>
                </Pressable>
              );
            })
          : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((val) => {
              const rad = (val * 6 - 90) * (Math.PI / 180);
              const x = CENTER + RADIUS * Math.cos(rad) - NODE_SIZE / 2;
              const y = CENTER + RADIUS * Math.sin(rad) - NODE_SIZE / 2;
              const isSelected = Math.abs(minute - val) < 3;

              return (
                <Pressable
                  key={`m-${val}`}
                  onPress={() => handleSelectMinute(val)}
                  style={[
                    styles.node,
                    { left: x, top: y, width: NODE_SIZE, height: NODE_SIZE, borderRadius: NODE_SIZE / 2 },
                    isSelected && styles.nodeSelected,
                  ]}
                >
                  <Text style={[styles.nodeText, isSelected && styles.nodeTextSelected]}>
                    {String(val).padStart(2, "0")}
                  </Text>
                </Pressable>
              );
            })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    alignItems: "center",
    paddingVertical: 10,
  },
  headerDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 240,
    marginBottom: 8,
  },
  timeBoxGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  timeBoxActive: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
  },
  timeBoxText: {
    color: colors.onSurfaceSecondary,
    fontSize: 22,
    fontWeight: "700",
  },
  timeBoxTextActive: {
    color: colors.brandPrimary,
  },
  timeColon: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: "700",
  },
  amPmGroup: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 3,
  },
  amPmPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
  },
  amPmPillActive: {
    backgroundColor: colors.brandPrimary,
  },
  amPmPillText: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  amPmPillTextActive: {
    color: "#FFFFFF",
  },
  instructionHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 12,
  },
  clockFace: {
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  centerDot: {
    position: "absolute",
    backgroundColor: colors.brandPrimary,
    zIndex: 10,
  },
  node: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 15,
  },
  nodeSelected: {
    backgroundColor: colors.brandPrimary,
  },
  nodeText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "600",
  },
  nodeTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
}));

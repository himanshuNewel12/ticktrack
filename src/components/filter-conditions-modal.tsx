import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import type { TaskList } from "@/src/types";

export type FilterTab = "Lists" | "Date" | "Priority" | "Type";
export type TypeFilter = "all" | "task" | "note";
export type PriorityFilter = "all" | "high" | "medium" | "low" | "none";
export type DateFilter = "all" | "today" | "tomorrow" | "next7" | "overdue" | "nodate";

export type FilterConditions = {
  type: TypeFilter;
  priority: PriorityFilter;
  listId: string; // 'all' or list ID
  date: DateFilter;
};

type Props = {
  visible: boolean;
  initialTab?: FilterTab;
  conditions: FilterConditions;
  lists: TaskList[];
  onClose: () => void;
  onApply: (conditions: FilterConditions) => void;
};

const TABS: FilterTab[] = ["Lists", "Date", "Priority", "Type"];

export function FilterConditionsModal({
  visible,
  initialTab = "Type",
  conditions,
  lists,
  onClose,
  onApply,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab);
  const [draft, setDraft] = useState<FilterConditions>(conditions);

  useEffect(() => {
    if (visible) {
      setDraft(conditions);
      setActiveTab(initialTab);
    }
  }, [visible, conditions, initialTab]);

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              testID="filter-modal-close"
              onPress={onClose}
              style={styles.headerBtn}
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.headerTitle}>Filter Conditions</Text>
            <Pressable
              testID="filter-modal-apply"
              onPress={handleApply}
              style={styles.headerBtn}
              hitSlop={12}
            >
              <Ionicons name="checkmark" size={24} color={colors.brandPrimary} />
            </Pressable>
          </View>

          {/* Category Tabs */}
          <View style={styles.tabsRow}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  testID={`filter-tab-${tab.toLowerCase()}`}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.tabChip, isActive && styles.tabChipActive]}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {tab}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Tab Options Content */}
          <ScrollView
            style={styles.optionsList}
            contentContainerStyle={styles.optionsContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.optionsCard}>
              {activeTab === "Type" && (
                <>
                  <OptionRow
                    icon={<Ionicons name="folder-outline" size={20} color={colors.onSurface} />}
                    label="All"
                    selected={draft.type === "all"}
                    onSelect={() => setDraft((prev) => ({ ...prev, type: "all" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="checkbox-outline" size={20} color={colors.onSurface} />}
                    label="Task"
                    selected={draft.type === "task"}
                    onSelect={() => setDraft((prev) => ({ ...prev, type: "task" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="document-text-outline" size={20} color={colors.onSurface} />}
                    label="Note"
                    selected={draft.type === "note"}
                    onSelect={() => setDraft((prev) => ({ ...prev, type: "note" }))}
                    colors={colors}
                    styles={styles}
                    isLast
                  />
                </>
              )}

              {activeTab === "Priority" && (
                <>
                  <OptionRow
                    icon={<Ionicons name="folder-outline" size={20} color={colors.onSurface} />}
                    label="All"
                    selected={draft.priority === "all"}
                    onSelect={() => setDraft((prev) => ({ ...prev, priority: "all" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="flag" size={20} color="#EF4444" />}
                    label="High Priority"
                    selected={draft.priority === "high"}
                    onSelect={() => setDraft((prev) => ({ ...prev, priority: "high" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="flag" size={20} color="#F59E0B" />}
                    label="Medium Priority"
                    selected={draft.priority === "medium"}
                    onSelect={() => setDraft((prev) => ({ ...prev, priority: "medium" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="flag" size={20} color="#3B82F6" />}
                    label="Low Priority"
                    selected={draft.priority === "low"}
                    onSelect={() => setDraft((prev) => ({ ...prev, priority: "low" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="flag-outline" size={20} color={colors.muted} />}
                    label="No Priority"
                    selected={draft.priority === "none"}
                    onSelect={() => setDraft((prev) => ({ ...prev, priority: "none" }))}
                    colors={colors}
                    styles={styles}
                    isLast
                  />
                </>
              )}

              {activeTab === "Lists" && (
                <>
                  <OptionRow
                    icon={<Ionicons name="folder-outline" size={20} color={colors.onSurface} />}
                    label="All"
                    selected={draft.listId === "all"}
                    onSelect={() => setDraft((prev) => ({ ...prev, listId: "all" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="file-tray-outline" size={20} color={colors.brandPrimary} />}
                    label="Inbox"
                    selected={draft.listId === "inbox"}
                    onSelect={() => setDraft((prev) => ({ ...prev, listId: "inbox" }))}
                    colors={colors}
                    styles={styles}
                  />
                  {lists.map((l, idx) => (
                    <OptionRow
                      key={l.id}
                      icon={
                        l.emoji ? (
                          <Text style={{ fontSize: 18 }}>{l.emoji}</Text>
                        ) : (
                          <Ionicons name="list" size={20} color={l.color || colors.brandPrimary} />
                        )
                      }
                      label={l.name}
                      selected={draft.listId === l.id}
                      onSelect={() => setDraft((prev) => ({ ...prev, listId: l.id }))}
                      colors={colors}
                      styles={styles}
                      isLast={idx === lists.length - 1}
                    />
                  ))}
                </>
              )}

              {activeTab === "Date" && (
                <>
                  <OptionRow
                    icon={<Ionicons name="folder-outline" size={20} color={colors.onSurface} />}
                    label="All"
                    selected={draft.date === "all"}
                    onSelect={() => setDraft((prev) => ({ ...prev, date: "all" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="sunny-outline" size={20} color="#F59E0B" />}
                    label="Today"
                    selected={draft.date === "today"}
                    onSelect={() => setDraft((prev) => ({ ...prev, date: "today" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="partly-sunny-outline" size={20} color="#3B82F6" />}
                    label="Tomorrow"
                    selected={draft.date === "tomorrow"}
                    onSelect={() => setDraft((prev) => ({ ...prev, date: "tomorrow" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="calendar-outline" size={20} color={colors.brandPrimary} />}
                    label="Next 7 Days"
                    selected={draft.date === "next7"}
                    onSelect={() => setDraft((prev) => ({ ...prev, date: "next7" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="alert-circle-outline" size={20} color="#EF4444" />}
                    label="Overdue"
                    selected={draft.date === "overdue"}
                    onSelect={() => setDraft((prev) => ({ ...prev, date: "overdue" }))}
                    colors={colors}
                    styles={styles}
                  />
                  <OptionRow
                    icon={<Ionicons name="time-outline" size={20} color={colors.muted} />}
                    label="No Date"
                    selected={draft.date === "nodate"}
                    onSelect={() => setDraft((prev) => ({ ...prev, date: "nodate" }))}
                    colors={colors}
                    styles={styles}
                    isLast
                  />
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({
  icon,
  label,
  selected,
  onSelect,
  colors,
  styles,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onSelect: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  styles: ReturnType<typeof useStyles>;
  isLast?: boolean;
}) {
  return (
    <Pressable
      testID={`filter-option-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.optionRow,
        !isLast && styles.optionBorder,
        pressed && styles.optionPressed,
      ]}
    >
      <View style={styles.optionLeft}>
        <View style={styles.optionIconWrap}>{icon}</View>
        <Text style={styles.optionLabel}>{label}</Text>
      </View>
      {selected ? (
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    minHeight: 380,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: "700",
  },
  tabsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  tabChipActive: {
    backgroundColor: colors.brandTertiary,
  },
  tabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  tabTextActive: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  optionsList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  optionsContainer: {
    paddingBottom: 24,
  },
  optionsCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionPressed: {
    backgroundColor: colors.surfaceTertiary,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  optionIconWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "500",
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
}));

import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { addDays, addMonths, endOfMonth, format, isSameDay, isSameMonth, isSameYear, startOfMonth, startOfWeek } from "date-fns";
import { useMemo, useRef, useState, type ComponentType } from "react";
import { ColorValue, Modal, PanResponder, Pressable, ScrollView, Switch, Text, View, Share, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fab } from "@/src/components/fab";
import { TaskComposer, type ComposerKind } from "@/src/components/task-composer";
import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { Task } from "@/src/types";
import { parseTaskDate, getTaskTimestamp } from "@/src/utils/date-utils";
import {
  ColorScreen,
  ColorPickScreen,
  StyleScreen,
  ShowItemIconsScreen,
} from "@/src/components/view-options-subscreens";

type LooseIconProps = { name: string; size: number; color?: ColorValue };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

type ViewMode = "list" | "year" | "month" | "week" | "3day" | "day";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: string }[] = [
  { key: "list", label: "List", icon: "list-outline" },
  { key: "year", label: "Year", icon: "grid-outline" },
  { key: "month", label: "Month", icon: "apps-outline" },
  { key: "week", label: "Week", icon: "menu-outline" },
  { key: "3day", label: "3 Day", icon: "reorder-three-outline" },
  { key: "day", label: "Day", icon: "square-outline" },
];

export default function CalendarScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { tasks, lists, toggleTask } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [viewMenu, setViewMenu] = useState(false);
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState(new Date());
  const [composer, setComposer] = useState<ComposerKind | null>(null);

  // Modals & Panels requested by user from screenshots
  const [viewOptionsModal, setViewOptionsModal] = useState(false);
  const [arrangeTasksDrawer, setArrangeTasksDrawer] = useState(false);
  const [arrangeSettingsModal, setArrangeSettingsModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // View Options state
  const [showDetails, setShowDetails] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showRepeatCycles, setShowRepeatCycles] = useState(true);
  const [showFocusRecords, setShowFocusRecords] = useState(false);

  // Arrange Tasks state
  const [arrangeType, setArrangeType] = useState<"undated" | "overdue">("undated");
  const [showNotes, setShowNotes] = useState(true);
  const [showHierarchy, setShowHierarchy] = useState(true);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal swipes where horizontal delta > vertical delta and > 20px
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, dy } = gestureState;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 35) {
          if (dx < 0) {
            // Swipe Left -> Next Month
            setSelected((prev) => addMonths(prev, 1));
          } else {
            // Swipe Right -> Previous Month
            setSelected((prev) => addMonths(prev, -1));
          }
        }
      },
    })
  ).current;

  const today = new Date();
  const monthLabel = format(selected, "MMMM");
  const yearLabel = format(selected, "yyyy");
  const isToday = isSameDay(selected, today);

  const scheduled = useMemo(
    () =>
      tasks
        .filter((task) => {
          if (!task.due_date) return false;
          if (!showCompleted && task.completed) return false;
          const parsed = parseTaskDate(task.due_date);
          return parsed ? isSameDay(parsed, selected) : false;
        })
        .sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a)),
    [tasks, selected, showCompleted]
  );

  const goToday = () => setSelected(new Date());

  const handleScheduleTask = (task: Task) => {
    const formattedDate = format(selected, "yyyy-MM-dd");
    void toggleTask({ ...task, due_date: formattedDate });
    showToast(`Scheduled "${task.title}" for ${format(selected, "MMM d")}`);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 6 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{monthLabel}</Text>
          {!isSameYear(selected, today) ? <Text style={styles.headingYear}>{yearLabel}</Text> : null}
        </View>

        {/* View Options Header Button */}
        <Pressable
          testID="header-view-options"
          onPress={() => setViewOptionsModal(true)}
          style={styles.iconButton}
        >
          <Ionicons name="options-outline" size={22} color={colors.onSurface} />
        </Pressable>

        {/* Arrange Tasks Header Button */}
        <Pressable
          testID="header-arrange-tasks"
          onPress={() => setArrangeTasksDrawer(true)}
          style={styles.iconButton}
        >
          <Ionicons name="albums-outline" size={22} color={colors.onSurface} />
        </Pressable>

        {/* 3 Vertical Dots Header Button */}
        <Pressable
          testID="calendar-menu"
          onPress={() => setMenu(true)}
          style={styles.iconButton}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {!isToday ? (
        <Pressable onPress={goToday} style={[styles.tooltip, { top: insets.top + 46 }]} testID="tap-today-tooltip">
          <Text style={styles.tooltipText}>Tap to go today</Text>
          <View style={styles.tooltipArrow} />
        </Pressable>
      ) : null}

      {/* Toast Banner */}
      {toastMessage ? (
        <View style={[styles.toastBanner, { top: insets.top + 60 }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="calendar-scroll">
          {viewMode === "month" ? (
            <MonthGrid selected={selected} today={today} tasks={tasks} onSelect={setSelected} styles={styles} colors={colors} />
          ) : viewMode === "list" ? (
            <ListView selected={selected} tasks={tasks} onSelect={setSelected} onToggle={toggleTask} showDetails={showDetails} styles={styles} colors={colors} />
          ) : viewMode === "week" ? (
            <WeekView selected={selected} today={today} tasks={tasks} onSelect={setSelected} styles={styles} colors={colors} />
          ) : viewMode === "day" ? (
            <DayHeader date={selected} styles={styles} />
          ) : viewMode === "3day" ? (
            <ThreeDayView selected={selected} today={today} tasks={tasks} onSelect={setSelected} styles={styles} colors={colors} />
          ) : (
            <YearGrid selected={selected} today={today} onSelectMonth={(d) => { setSelected(d); setViewMode("month"); }} styles={styles} colors={colors} />
          )}

          {viewMode !== "list" ? (
            scheduled.length ? (
              <View style={styles.scheduledList}>
                {scheduled.map((task) => (
                  <TaskEvent key={task.id} task={task} showDetails={showDetails} onToggle={() => toggleTask(task)} styles={styles} colors={colors} />
                ))}
              </View>
            ) : (
              <FreeDayEmpty styles={styles} colors={colors} />
            )
          ) : null}
        </ScrollView>
      </View>

      <Fab onPress={() => setComposer("task")} testID="calendar-add-fab" />
      <TaskComposer kind={composer} onClose={() => setComposer(null)} defaultDue={format(selected, "yyyy-MM-dd")} />

      {/* 3-Dots Dropdown Menu */}
      <Modal visible={menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(false)}>
        <Pressable onPress={() => setMenu(false)} style={styles.menuBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.viewMenuCard, { top: insets.top + 44 }]} testID="calendar-menu-card">
            <MenuItem
              icon="options-outline"
              label="View Options"
              onPress={() => { setMenu(false); setViewOptionsModal(true); }}
              styles={styles}
              colors={colors}
            />
            <MenuItem
              icon="albums-outline"
              label="Arrange Tasks"
              onPress={() => { setMenu(false); setArrangeTasksDrawer(true); }}
              styles={styles}
              colors={colors}
            />
            <MenuItem
              icon="share-outline"
              label="Share Schedule"
              onPress={() => { setMenu(false); setShareModal(true); }}
              styles={styles}
              colors={colors}
            />
            <MenuItem
              icon="funnel-outline"
              label="Filter View Range"
              onPress={() => setMenu(false)}
              styles={styles}
              colors={colors}
            />
            <MenuItem
              icon="wifi-outline"
              label="Calendar Subscription"
              onPress={() => setMenu(false)}
              styles={styles}
              colors={colors}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* View Options Modal (Screenshot 1) */}
      <ViewOptionsModal
        visible={viewOptionsModal}
        lists={lists}
        showDetails={showDetails}
        setShowDetails={setShowDetails}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        showChecklist={showChecklist}
        setShowChecklist={setShowChecklist}
        showRepeatCycles={showRepeatCycles}
        setShowRepeatCycles={setShowRepeatCycles}
        showFocusRecords={showFocusRecords}
        setShowFocusRecords={setShowFocusRecords}
        onClose={() => setViewOptionsModal(false)}
        styles={styles}
        colors={colors}
      />

      {/* Arrange Tasks Side Panel (Screenshot 2 & 4) */}
      <ArrangeTasksDrawer
        visible={arrangeTasksDrawer}
        tasks={tasks}
        lists={lists}
        arrangeType={arrangeType}
        showNotes={showNotes}
        onScheduleTask={handleScheduleTask}
        onOpenSettings={() => setArrangeSettingsModal(true)}
        onClose={() => setArrangeTasksDrawer(false)}
        styles={styles}
        colors={colors}
      />

      {/* Arrange Tasks Settings Dialog (Screenshot 4) */}
      <ArrangeSettingsModal
        visible={arrangeSettingsModal}
        arrangeType={arrangeType}
        setArrangeType={setArrangeType}
        showNotes={showNotes}
        setShowNotes={setShowNotes}
        showHierarchy={showHierarchy}
        setShowHierarchy={setShowHierarchy}
        onClose={() => setArrangeSettingsModal(false)}
        styles={styles}
        colors={colors}
      />

      {/* Share Schedule Modal (Screenshot 5) */}
      <ShareScheduleModal
        visible={shareModal}
        selectedDate={selected}
        tasks={scheduled}
        onClose={() => setShareModal(false)}
        onToast={showToast}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

function MenuItem({ icon, label, onPress, styles, colors }: { icon: string; label: string; onPress: () => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.viewMenuRow, pressed && styles.rowPressed]}>
      <Ionicons name={icon as never} size={20} color={colors.onSurface} />
      <Text style={styles.viewMenuLabel}>{label}</Text>
    </Pressable>
  );
}

/* ============================================================================
   VIEW OPTIONS MODAL (Screenshot 1 & Sub-screens 2, 3, 4, 5)
   ============================================================================ */
function ViewOptionsModal(props: {
  visible: boolean;
  lists: any[];
  showDetails: boolean;
  setShowDetails: (val: boolean) => void;
  showCompleted: boolean;
  setShowCompleted: (val: boolean) => void;
  showChecklist: boolean;
  setShowChecklist: (val: boolean) => void;
  showRepeatCycles: boolean;
  setShowRepeatCycles: (val: boolean) => void;
  showFocusRecords: boolean;
  setShowFocusRecords: (val: boolean) => void;
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const insets = useSafeAreaInsets();
  const {
    visible,
    lists,
    showDetails,
    setShowDetails,
    showCompleted,
    setShowCompleted,
    showChecklist,
    setShowChecklist,
    showRepeatCycles,
    setShowRepeatCycles,
    showFocusRecords,
    setShowFocusRecords,
    onClose,
    styles,
    colors,
  } = props;

  const [subScreen, setSubScreen] = useState<"main" | "color" | "colorPick" | "style" | "showItemIcons">("main");
  const [colorBy, setColorBy] = useState<"List" | "Priority" | "Tag">("List");
  const [selectedListId, setSelectedListId] = useState<string>("inbox");
  const [selectedListName, setSelectedListName] = useState<string>("Inbox");
  const [listColors, setListColors] = useState<Record<string, string>>({});
  const [itemStyle, setItemStyle] = useState<"modern" | "classic">("classic");
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showTaskIcon, setShowTaskIcon] = useState<boolean>(true);
  const [showCalendarIcon, setShowCalendarIcon] = useState<boolean>(true);
  const [showNoteIcon, setShowNoteIcon] = useState<boolean>(true);
  const [showFocusRecordsIcon, setShowFocusRecordsIcon] = useState<boolean>(true);

  const handleClose = () => {
    setSubScreen("main");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={handleClose}>
      {subScreen === "color" ? (
        <ColorScreen
          colorBy={colorBy}
          setColorBy={setColorBy}
          lists={lists}
          listColors={listColors}
          onSelectList={(id, name) => {
            setSelectedListId(id);
            setSelectedListName(name);
            setSubScreen("colorPick");
          }}
          onBack={() => setSubScreen("main")}
        />
      ) : subScreen === "colorPick" ? (
        <ColorPickScreen
          targetName={selectedListName}
          selectedColor={listColors[selectedListId] || "#3B82F6"}
          onSelectColor={(hex) => {
            setListColors((prev) => ({ ...prev, [selectedListId]: hex }));
          }}
          onBack={() => setSubScreen("color")}
        />
      ) : subScreen === "style" ? (
        <StyleScreen
          itemStyle={itemStyle}
          setItemStyle={setItemStyle}
          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          onNavigateShowItemIcons={() => setSubScreen("showItemIcons")}
          onBack={() => setSubScreen("main")}
        />
      ) : subScreen === "showItemIcons" ? (
        <ShowItemIconsScreen
          showTaskIcon={showTaskIcon}
          setShowTaskIcon={setShowTaskIcon}
          showCalendarIcon={showCalendarIcon}
          setShowCalendarIcon={setShowCalendarIcon}
          showNoteIcon={showNoteIcon}
          setShowNoteIcon={setShowNoteIcon}
          showFocusRecordsIcon={showFocusRecordsIcon}
          setShowFocusRecordsIcon={setShowFocusRecordsIcon}
          onBack={() => setSubScreen("style")}
        />
      ) : (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <View style={styles.optionsHeader}>
            <Pressable onPress={handleClose} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.optionsHeaderTitle}>View Options</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Card 1: Color & Style Navigation */}
            <View style={styles.optionsCard}>
              <Pressable onPress={() => setSubScreen("color")} style={styles.optionsRow}>
                <Text style={styles.optionsLabel}>Color</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <View style={styles.optionsDivider} />
              <Pressable onPress={() => setSubScreen("style")} style={styles.optionsRow}>
                <Text style={styles.optionsLabel}>Style</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </View>

            {/* Card 2: Main Toggles */}
            <View style={styles.optionsCard}>
              <View style={styles.optionsToggleRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.optionsLabel}>Show Details</Text>
                  <Text style={styles.optionsSubtext}>Show task details in List view and Month view.</Text>
                </View>
                <Switch value={showDetails} onValueChange={setShowDetails} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.optionsDivider} />

              <View style={styles.optionsToggleRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.optionsLabel}>Show Completed</Text>
                  <Text style={styles.optionsSubtext}>Including completed tasks, checked-in habits and subscribed calendar events.</Text>
                </View>
                <Switch value={showCompleted} onValueChange={setShowCompleted} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.optionsDivider} />

              <View style={styles.optionsToggleRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.optionsLabel}>Show Checklist Item</Text>
                </View>
                <Switch value={showChecklist} onValueChange={setShowChecklist} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.optionsDivider} />

              <View style={styles.optionsToggleRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.optionsLabel}>Show All Repeat Cycles</Text>
                </View>
                <Switch value={showRepeatCycles} onValueChange={setShowRepeatCycles} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            {/* Card 3: Focus Records */}
            <View style={styles.optionsCard}>
              <View style={styles.optionsToggleRow}>
                <View style={{ flex: 1, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={styles.optionsLabel}>Show Focus Records</Text>
                  <Ionicons name="help-circle-outline" size={16} color={colors.muted} />
                </View>
                <Switch value={showFocusRecords} onValueChange={setShowFocusRecords} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            {/* Card 4: Additional Time Zone */}
            <View style={styles.optionsCard}>
              <Pressable style={styles.optionsRow}>
                <Text style={styles.optionsLabel}>Additional Time Zone</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

/* ============================================================================
   ARRANGE TASKS SIDE DRAWER (Screenshot 2)
   ============================================================================ */
function ArrangeTasksDrawer(props: {
  visible: boolean;
  tasks: Task[];
  lists: any[];
  arrangeType: "undated" | "overdue";
  showNotes: boolean;
  onScheduleTask: (task: Task) => void;
  onOpenSettings: () => void;
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"list" | "priority">("list");
  const { visible, tasks, lists, arrangeType, showNotes, onScheduleTask, onOpenSettings, onClose, styles, colors } = props;

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.completed) return false;
      if (arrangeType === "undated") return !t.due_date;
      if (arrangeType === "overdue") {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date();
      }
      return true;
    });
  }, [tasks, arrangeType]);

  const tasksByGroup = useMemo(() => {
    const groups: { title: string; tasks: Task[] }[] = [];
    if (activeTab === "list") {
      const map = new Map<string, Task[]>();
      filteredTasks.forEach((t) => {
        const listDoc = lists.find((l) => l.id === t.list_id);
        const name = listDoc ? `${listDoc.emoji ?? "📁"} ${listDoc.name}` : "Inbox";
        const arr = map.get(name) ?? [];
        arr.push(t);
        map.set(name, arr);
      });
      map.forEach((tList, title) => groups.push({ title, tasks: tList }));
    } else {
      const priorities = ["high", "medium", "low", "none"];
      priorities.forEach((p) => {
        const matching = filteredTasks.filter((t) => (t.priority ?? "none") === p);
        if (matching.length) {
          const title = p === "high" ? "🔴 High Priority" : p === "medium" ? "🟡 Medium Priority" : p === "low" ? "🔵 Low Priority" : "⚪ No Priority";
          groups.push({ title, tasks: matching });
        }
      });
    }
    return groups;
  }, [filteredTasks, activeTab, lists]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.drawerBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={[styles.arrangePanel, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
          {/* Panel Header */}
          <View style={styles.arrangeHeader}>
            <Text style={styles.arrangeTitle}>Arrange Tasks</Text>
            <Pressable onPress={onOpenSettings} style={styles.iconButton}>
              <Ionicons name="albums-outline" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          {/* Segmented Control Tabs */}
          <View style={styles.segmentedControl}>
            <Pressable
              onPress={() => setActiveTab("list")}
              style={[styles.segmentTab, activeTab === "list" && styles.segmentTabActive]}
            >
              <Text style={[styles.segmentLabel, activeTab === "list" && styles.segmentLabelActive]}>List</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("priority")}
              style={[styles.segmentTab, activeTab === "priority" && styles.segmentTabActive]}
            >
              <Text style={[styles.segmentLabel, activeTab === "priority" && styles.segmentLabelActive]}>Priority</Text>
            </Pressable>
          </View>

          {/* Task Pills List */}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
            {tasksByGroup.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>No un-scheduled tasks</Text>
              </View>
            ) : (
              tasksByGroup.map((group) => (
                <View key={group.title} style={{ marginBottom: 16 }}>
                  <Text style={styles.groupHeaderTitle}>{group.title}</Text>
                  {group.tasks.map((task) => (
                    <Pressable
                      key={task.id}
                      onPress={() => onScheduleTask(task)}
                      style={({ pressed }) => [styles.taskPill, pressed && { opacity: 0.8 }]}
                    >
                      <Ionicons name="square-outline" size={16} color={colors.brandPrimary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskPillTitle} numberOfLines={1}>{task.title}</Text>
                        {showNotes && task.notes ? <Text style={styles.taskPillNotes} numberOfLines={1}>{task.notes}</Text> : null}
                      </View>
                      <Ionicons name="calendar-outline" size={16} color={colors.brandPrimary} />
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>

          {/* Bottom Action Bar */}
          <View style={styles.arrangeBottomBar}>
            <Pressable onPress={onClose} style={styles.filterListsButton}>
              <Text style={styles.filterListsText}>Filter Lists</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============================================================================
   ARRANGE TASKS SETTINGS MODAL (Screenshot 4)
   ============================================================================ */
function ArrangeSettingsModal(props: {
  visible: boolean;
  arrangeType: "undated" | "overdue";
  setArrangeType: (type: "undated" | "overdue") => void;
  showNotes: boolean;
  setShowNotes: (val: boolean) => void;
  showHierarchy: boolean;
  setShowHierarchy: (val: boolean) => void;
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { visible, arrangeType, setArrangeType, showNotes, setShowNotes, showHierarchy, setShowHierarchy, onClose, styles, colors } = props;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.dialogBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Arrange Tasks</Text>
          <Text style={styles.dialogSubtitle}>Select a type, then drag and drop a task onto Calendar.</Text>

          {/* Radios */}
          <Pressable onPress={() => setArrangeType("undated")} style={styles.dialogOptionRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.onSurface} />
            <Text style={styles.dialogOptionText}>Undated Task</Text>
            <Ionicons name={arrangeType === "undated" ? "radio-button-on" : "radio-button-off"} size={20} color={arrangeType === "undated" ? colors.brandPrimary : colors.muted} />
          </Pressable>

          <Pressable onPress={() => setArrangeType("overdue")} style={styles.dialogOptionRow}>
            <Ionicons name="time-outline" size={20} color={colors.onSurface} />
            <Text style={styles.dialogOptionText}>Overdue Task</Text>
            <Ionicons name={arrangeType === "overdue" ? "radio-button-on" : "radio-button-off"} size={20} color={arrangeType === "overdue" ? colors.brandPrimary : colors.muted} />
          </Pressable>

          <View style={styles.optionsDivider} />

          {/* Checkboxes */}
          <Pressable onPress={() => setShowNotes(!showNotes)} style={styles.dialogOptionRow}>
            <Ionicons name="document-text-outline" size={20} color={colors.onSurface} />
            <Text style={styles.dialogOptionText}>Show Notes</Text>
            <Ionicons name={showNotes ? "checkbox" : "square-outline"} size={20} color={showNotes ? colors.brandPrimary : colors.muted} />
          </Pressable>

          <Pressable onPress={() => setShowHierarchy(!showHierarchy)} style={styles.dialogOptionRow}>
            <Ionicons name="git-network-outline" size={20} color={colors.onSurface} />
            <Text style={styles.dialogOptionText}>Show Task Hierarchy</Text>
            <Ionicons name={showHierarchy ? "checkbox" : "square-outline"} size={20} color={showHierarchy ? colors.brandPrimary : colors.muted} />
          </Pressable>

          {/* OK Button */}
          <Pressable onPress={onClose} style={styles.dialogOkButton}>
            <Text style={styles.dialogOkText}>OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============================================================================
   SHARE SCHEDULE MODAL (Screenshot 5)
   ============================================================================ */
function ShareScheduleModal(props: {
  visible: boolean;
  selectedDate: Date;
  tasks: Task[];
  onClose: () => void;
  onToast: (msg: string) => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const insets = useSafeAreaInsets();
  const { visible, selectedDate, tasks, onClose, onToast, styles, colors } = props;
  const [shareTab, setShareTab] = useState<"text" | "image">("text");
  const [shareTitleContent, setShareTitleContent] = useState(false);

  const formattedDate = format(selectedDate, "d MMM");
  const scheduleLines = tasks.length
    ? tasks.map((t) => `- ${t.title}${t.due_date?.includes("T") ? ` (${format(new Date(t.due_date), "d MMM, h:mma")})` : ""}`).join("\n")
    : "- Free day";

  const shareContent = `${formattedDate}\n\n${scheduleLines}\n\nFrom TickTrack:\nhttps://ticktrack.app`;

  const handleCopy = () => {
    try {
      if (typeof navigator !== "undefined" && (navigator as any).clipboard) {
        void (navigator as any).clipboard.writeText(shareContent);
      }
    } catch {}
    onToast("Schedule copied to clipboard");
    onClose();
  };

  const handleShareApp = async () => {
    try {
      if (Platform.OS !== "web" || (typeof navigator !== "undefined" && "share" in navigator)) {
        await Share.share({
          message: shareContent,
          title: `Schedule for ${formattedDate}`,
        });
      } else if (typeof navigator !== "undefined" && (navigator as any).clipboard) {
        await (navigator as any).clipboard.writeText(shareContent);
        onToast("Schedule copied to clipboard");
      }
    } catch {}
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header with Close and Tabs */}
        <View style={styles.shareHeader}>
          <Pressable onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>

          <View style={styles.shareTabs}>
            <Pressable onPress={() => setShareTab("text")} style={[styles.shareTab, shareTab === "text" && styles.shareTabActive]}>
              <Text style={[styles.shareTabText, shareTab === "text" && styles.shareTabTextActive]}>Text</Text>
            </Pressable>
            <Pressable onPress={() => setShareTab("image")} style={[styles.shareTab, shareTab === "image" && styles.shareTabActive]}>
              <Text style={[styles.shareTabText, shareTab === "image" && styles.shareTabTextActive]}>Image</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
          {/* Radio Option */}
          <Pressable onPress={() => setShareTitleContent(!shareTitleContent)} style={styles.shareOptionRow}>
            <Ionicons name={shareTitleContent ? "radio-button-on" : "radio-button-off"} size={18} color={shareTitleContent ? colors.brandPrimary : colors.muted} />
            <Text style={styles.shareOptionText}>Share both title and content</Text>
          </Pressable>

          {/* Schedule Preview Card */}
          <View style={styles.sharePreviewCard}>
            <Text style={styles.sharePreviewTitle}>{formattedDate}</Text>
            <Text style={styles.sharePreviewBody}>{scheduleLines}</Text>
            <View style={styles.optionsDivider} />
            <Text style={styles.sharePreviewFooter}>From TickTrack:{"\n"}https://ticktrack.app</Text>
          </View>
        </ScrollView>

        {/* Bottom Social Share Bar */}
        <View style={[styles.shareActionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable style={styles.shareAppItem} onPress={handleShareApp}>
            <View style={[styles.shareAppIcon, { backgroundColor: "#000" }]}>
              <Ionicons name="logo-twitter" size={20} color="#fff" />
            </View>
            <Text style={styles.shareAppLabel}>X</Text>
          </Pressable>

          <Pressable style={styles.shareAppItem} onPress={handleShareApp}>
            <View style={[styles.shareAppIcon, { backgroundColor: "#ea4335" }]}>
              <Ionicons name="logo-google" size={20} color="#fff" />
            </View>
            <Text style={styles.shareAppLabel}>Google+</Text>
          </Pressable>

          <Pressable style={styles.shareAppItem} onPress={handleShareApp}>
            <View style={[styles.shareAppIcon, { backgroundColor: colors.brandPrimary }]}>
              <Ionicons name="mail-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.shareAppLabel}>Email</Text>
          </Pressable>

          <Pressable style={styles.shareAppItem} onPress={handleCopy}>
            <View style={[styles.shareAppIcon, { backgroundColor: "#f59e0b" }]}>
              <Ionicons name="copy-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.shareAppLabel}>Copy</Text>
          </Pressable>

          <Pressable style={styles.shareAppItem} onPress={handleShareApp}>
            <View style={[styles.shareAppIcon, { backgroundColor: "#10b981" }]}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </View>
            <Text style={styles.shareAppLabel}>More</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ============================================================================
   EXISTING CALENDAR SUB-COMPONENTS
   ============================================================================ */
function MonthGrid({ selected, today, tasks, onSelect, styles, colors }: { selected: Date; today: Date; tasks: Task[]; onSelect: (d: Date) => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const monthStart = startOfMonth(selected);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) cells.push(addDays(gridStart, i));
  const busyDates = new Set(
    tasks
      .filter((task) => task.due_date && !task.completed)
      .map((task) => {
        const parsed = parseTaskDate(task.due_date);
        return parsed ? format(parsed, "yyyy-MM-dd") : "";
      })
      .filter(Boolean)
  );
  return (
    <View>
      <View style={styles.weekRow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <Text key={day} style={styles.weekLabel}>{day}</Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {cells.map((date) => {
          const inMonth = isSameMonth(date, selected);
          const isSel = isSameDay(date, selected);
          const isTodayCell = isSameDay(date, today);
          const hasTasks = busyDates.has(format(date, "yyyy-MM-dd"));

          return (
            <Pressable key={date.toISOString()} testID={`day-${format(date, "yyyy-MM-dd")}`} onPress={() => onSelect(date)} style={styles.monthCell}>
              <View style={styles.monthDayInner}>
                {isSel ? (
                  <View style={[styles.dayCircleBg, { backgroundColor: colors.brandPrimary }]} />
                ) : isTodayCell ? (
                  <View style={[styles.dayCircleBg, { borderWidth: 1.5, borderColor: colors.brandPrimary }]} />
                ) : null}
                <Text
                  style={[
                    styles.monthDayText,
                    !inMonth && !isSel ? styles.monthDayMuted : null,
                    isTodayCell && !isSel ? styles.monthDayTextToday : null,
                    isSel ? { color: "#FFFFFF", fontWeight: "700" } : null,
                  ]}
                >
                  {format(date, "d")}
                </Text>
              </View>
              {hasTasks && !isSel ? <View style={[styles.dot, { backgroundColor: colors.brandPrimary }]} /> : null}
              {hasTasks && isSel ? <View style={[styles.dot, { backgroundColor: "#FFFFFF" }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WeekView({ selected, today, tasks, onSelect, styles, colors }: { selected: Date; today: Date; tasks: Task[]; onSelect: (d: Date) => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const start = startOfWeek(selected, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const busy = new Set(
    tasks
      .filter((t) => t.due_date && !t.completed)
      .map((t) => {
        const parsed = parseTaskDate(t.due_date);
        return parsed ? format(parsed, "yyyy-MM-dd") : "";
      })
      .filter(Boolean)
  );
  return (
    <View style={styles.weekRowLarge}>
      {days.map((date) => {
        const isSel = isSameDay(date, selected);
        const isToday = isSameDay(date, today);
        const has = busy.has(format(date, "yyyy-MM-dd"));

        return (
          <Pressable key={date.toISOString()} onPress={() => onSelect(date)} style={styles.weekCell}>
            <Text style={styles.weekLabelSmall}>{format(date, "EEE")}</Text>
            <View style={styles.monthDayInner}>
              {isSel ? (
                <View style={[styles.dayCircleBg, { backgroundColor: colors.brandPrimary }]} />
              ) : isToday ? (
                <View style={[styles.dayCircleBg, { borderWidth: 1.5, borderColor: colors.brandPrimary }]} />
              ) : null}
              <Text
                style={[
                  styles.monthDayText,
                  isToday && !isSel ? styles.monthDayTextToday : null,
                  isSel ? { color: "#FFFFFF", fontWeight: "700" } : null,
                ]}
              >
                {format(date, "d")}
              </Text>
            </View>
            {has ? <View style={[styles.dot, { backgroundColor: isSel ? "#FFFFFF" : colors.brandPrimary }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ThreeDayView({ selected, today, tasks, onSelect, styles, colors }: { selected: Date; today: Date; tasks: Task[]; onSelect: (d: Date) => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const days = [-1, 0, 1].map((offset) => addDays(selected, offset));
  const busy = new Set(
    tasks
      .filter((t) => t.due_date && !t.completed)
      .map((t) => {
        const parsed = parseTaskDate(t.due_date);
        return parsed ? format(parsed, "yyyy-MM-dd") : "";
      })
      .filter(Boolean)
  );
  return (
    <View style={styles.threeDayRow}>
      {days.map((date) => {
        const isSel = isSameDay(date, selected);
        const isToday = isSameDay(date, today);
        const has = busy.has(format(date, "yyyy-MM-dd"));

        return (
          <Pressable key={date.toISOString()} onPress={() => onSelect(date)} style={[styles.threeDayCell, isSel && styles.threeDayCellSelected]}>
            <Text style={[styles.weekLabelSmall, isSel && { color: "#FFFFFF" }]}>{format(date, "EEE")}</Text>
            <Text
              style={[
                styles.monthDayText,
                { fontSize: 22 },
                isToday && !isSel ? styles.monthDayTextToday : null,
                isSel ? { color: "#FFFFFF", fontWeight: "700" } : null,
              ]}
            >
              {format(date, "d")}
            </Text>
            {has ? <View style={[styles.dot, { backgroundColor: isSel ? "#FFFFFF" : colors.brandPrimary }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function YearGrid({ selected, today, onSelectMonth, styles, colors }: { selected: Date; today: Date; onSelectMonth: (d: Date) => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(selected.getFullYear(), i, 1));
  return (
    <View style={styles.yearGrid}>
      {months.map((date) => {
        const isCurrent = isSameMonth(date, today);
        const isSel = isSameMonth(date, selected);
        return (
          <Pressable key={date.toISOString()} onPress={() => onSelectMonth(date)} style={[styles.yearCell, isSel && { borderColor: colors.brandPrimary }]}>
            <Text style={[styles.yearLabel, isCurrent && { color: colors.brandPrimary }]}>{format(date, "MMM")}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DayHeader({ date, styles }: { date: Date; styles: ReturnType<typeof useStyles> }) {
  return (
    <View style={styles.dayHeader}>
      <Text style={styles.dayHeaderWeek}>{format(date, "EEEE").toUpperCase()}</Text>
      <Text style={styles.dayHeaderTitle}>{format(date, "MMMM d, yyyy")}</Text>
    </View>
  );
}

function ListView({ selected, tasks, onSelect, onToggle, showDetails, styles, colors }: { selected: Date; tasks: Task[]; onSelect: (d: Date) => void; onToggle: (task: Task) => void; showDetails?: boolean; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const upcoming = useMemo(() => {
    const start = startOfMonth(selected);
    const end = endOfMonth(addMonths(selected, 1));
    return tasks
      .filter((task) => task.due_date && !task.completed)
      .filter((task) => {
        const due = parseTaskDate(task.due_date);
        return due ? (due >= start && due <= end) : false;
      })
      .sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a));
  }, [tasks, selected]);
  const groups = new Map<string, Task[]>();
  upcoming.forEach((task) => {
    const parsed = parseTaskDate(task.due_date);
    const key = parsed ? format(parsed, "yyyy-MM-dd") : (task.due_date?.slice(0, 10) ?? "");
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  });
  if (upcoming.length === 0) {
    return <FreeDayEmpty styles={styles} colors={colors} />;
  }
  return (
    <View style={{ paddingTop: 4 }}>
      {[...groups.entries()].map(([dateKey, items]) => {
        const date = new Date(dateKey);
        return (
          <View key={dateKey} style={styles.listGroup}>
            <Pressable onPress={() => onSelect(date)}>
              <Text style={styles.listGroupDate}>{format(date, "EEE, MMM d")}</Text>
            </Pressable>
            {items.map((task) => (
              <TaskEvent key={task.id} task={task} showDetails={showDetails} onToggle={() => onToggle(task)} styles={styles} colors={colors} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function TaskEvent({ task, onToggle, showDetails, styles, colors }: { task: Task; onToggle: () => void; showDetails?: boolean; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const priorityColor = task.priority === "high" ? colors.error : task.priority === "low" ? colors.success : colors.brandPrimary;
  return (
    <View style={styles.eventCard} testID={`event-${task.id}`}>
      <View style={[styles.eventBar, { backgroundColor: priorityColor }]} />
      <Pressable onPress={onToggle} style={[styles.checkboxSmall, task.completed && styles.checkboxDone]}>
        <Ionicons name="checkmark" size={13} color={task.completed ? colors.onBrandPrimary : "transparent"} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>{task.title}</Text>
        <Text style={styles.eventMeta}>
          {task.due_date?.includes("T") ? format(new Date(task.due_date), "h:mm a") : "All day"}
          {task.recurrence !== "none" ? ` · Repeats ${task.recurrence}` : ""}
        </Text>
        {showDetails && task.notes ? <Text style={styles.eventNotes}>{task.notes}</Text> : null}
      </View>
    </View>
  );
}

function FreeDayEmpty({ styles, colors }: { styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIllustration}>
        <View style={styles.emptyBlob} />
        <View style={styles.emptyCalendar}>
          <View style={styles.emptyCalendarTop} />
          <View style={styles.emptyCalendarBody}>
            <Ionicons name="refresh-outline" size={30} color={colors.brandPrimary} />
          </View>
          <View style={styles.emptyPinLeft} />
          <View style={styles.emptyPinMiddle} />
          <View style={styles.emptyPinRight} />
        </View>
        <View style={styles.starOne} />
        <View style={styles.starTwo} />
      </View>
      <Text style={styles.emptyTitle}>You have a free day</Text>
      <Text style={styles.emptyCopy}>Take it easy</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 8 },
  heading: { color: colors.onSurface, fontSize: 26, fontWeight: "700" },
  headingYear: { color: colors.muted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, marginLeft: 4 },
  iconButtonActive: { backgroundColor: colors.brandTertiary },
  tooltip: { position: "absolute", left: 24, backgroundColor: "rgba(20,22,30,0.9)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, zIndex: 10 },
  tooltipText: { color: "#FFFFFF", fontSize: 12, fontWeight: "500" },
  tooltipArrow: { position: "absolute", top: -6, left: 22, width: 12, height: 12, backgroundColor: "rgba(20,22,30,0.9)", transform: [{ rotate: "45deg" }] },
  content: { paddingHorizontal: 12, paddingBottom: 140 },

  toastBanner: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1e2230", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, zIndex: 100, elevation: 6 },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  weekRow: { flexDirection: "row", marginBottom: 8, paddingHorizontal: 4 },
  weekLabel: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "500" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthCell: { width: `${100 / 7}%`, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  monthDayInner: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  dayCircleBg: { position: "absolute", width: 36, height: 36, borderRadius: 18 },
  monthDaySelected: { backgroundColor: colors.brandPrimary },
  monthDayToday: { borderWidth: 1.5, borderColor: colors.brandPrimary },
  monthDayText: { color: colors.onSurface, fontSize: 16, fontWeight: "500", textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  monthDayMuted: { color: colors.muted, opacity: 0.4 },
  monthDayTextSelected: { color: "#FFFFFF", fontWeight: "700", textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  monthDayTextToday: { color: colors.brandPrimary, fontWeight: "600", textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },

  weekRowLarge: { flexDirection: "row", paddingHorizontal: 4 },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 6 },
  weekLabelSmall: { color: colors.muted, fontSize: 11, fontWeight: "500" },

  threeDayRow: { flexDirection: "row", gap: 10, paddingHorizontal: 4 },
  threeDayCell: { flex: 1, alignItems: "center", padding: 16, borderRadius: 18, backgroundColor: colors.surfaceSecondary, gap: 8 },
  threeDayCellSelected: { backgroundColor: colors.brandPrimary },

  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 4 },
  yearCell: { width: "30%", flexGrow: 1, minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  yearLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },

  dayHeader: { padding: 16, backgroundColor: colors.brandTertiary, borderRadius: 16, marginTop: 4 },
  dayHeaderWeek: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 1, fontWeight: "500" },
  dayHeaderTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "700", marginTop: 4 },

  scheduledList: { marginTop: 22 },
  eventCard: { minHeight: 66, borderRadius: 14, backgroundColor: colors.surfaceSecondary, marginBottom: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBar: { width: 4, height: 36, borderRadius: 2 },
  checkboxSmall: { width: 22, height: 22, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  eventTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  eventMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  eventNotes: { color: colors.muted, fontSize: 11, marginTop: 3, fontStyle: "italic" },

  listGroup: { marginBottom: 14 },
  listGroupDate: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600", marginBottom: 8, letterSpacing: 0.4 },

  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 20 },
  emptyIllustration: { width: 220, height: 200, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  emptyBlob: { position: "absolute", width: 200, height: 130, borderRadius: 100, backgroundColor: colors.surfaceSecondary, top: 40 },
  emptyCalendar: { width: 110, height: 90, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.onSurface, alignItems: "center", justifyContent: "flex-end" },
  emptyCalendarTop: { width: "100%", height: 18, backgroundColor: colors.brandPrimary, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  emptyCalendarBody: { flex: 1, alignItems: "center", justifyContent: "center", width: "100%" },
  emptyPinLeft: { position: "absolute", top: -6, left: 18, width: 6, height: 14, borderRadius: 3, backgroundColor: colors.onSurface },
  emptyPinMiddle: { position: "absolute", top: -6, left: 52, width: 6, height: 14, borderRadius: 3, backgroundColor: colors.onSurface },
  emptyPinRight: { position: "absolute", top: -6, right: 18, width: 6, height: 14, borderRadius: 3, backgroundColor: colors.onSurface },
  starOne: { position: "absolute", top: 18, right: 30, width: 10, height: 10, borderRadius: 2, backgroundColor: colors.onSurface, transform: [{ rotate: "45deg" }] },
  starTwo: { position: "absolute", bottom: 40, left: 20, width: 6, height: 6, borderRadius: 1, backgroundColor: colors.onSurface, transform: [{ rotate: "45deg" }] },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptyCopy: { color: colors.muted, fontSize: 14, textAlign: "center" },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)" },
  viewMenuCard: { position: "absolute", right: 12, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 8, minWidth: 240, shadowColor: colors.surfaceInverse, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  viewMenuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  viewMenuLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "500", flex: 1 },
  rowPressed: { opacity: 0.72 },

  // View Options Modal Styles (Screenshot 1)
  optionsHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  optionsHeaderTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "700", marginLeft: 8 },
  optionsCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, overflow: "hidden" },
  optionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 16 },
  optionsToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  optionsLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  optionsSubtext: { color: colors.muted, fontSize: 12, marginTop: 3 },
  optionsDivider: { height: 1, backgroundColor: colors.divider, marginHorizontal: 16 },

  // Arrange Tasks Side Panel Styles (Screenshot 2)
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  arrangePanel: { position: "absolute", right: 0, top: 0, bottom: 0, width: 320, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderBottomLeftRadius: 20, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  arrangeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  arrangeTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  segmentedControl: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 12, marginHorizontal: 16, padding: 3, marginBottom: 8 },
  segmentTab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  segmentTabActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  segmentLabel: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  segmentLabelActive: { color: colors.brandPrimary },
  groupHeaderTitle: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 8, letterSpacing: 0.5 },
  taskPill: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.brandTertiary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, marginBottom: 6 },
  taskPillTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  taskPillNotes: { color: colors.muted, fontSize: 11, marginTop: 2 },
  arrangeBottomBar: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider, alignItems: "center" },
  filterListsButton: { paddingVertical: 8, paddingHorizontal: 16 },
  filterListsText: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600" },

  // Arrange Settings Dialog Styles (Screenshot 4)
  dialogBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  dialogCard: { width: "100%", maxWidth: 320, backgroundColor: colors.surface, borderRadius: 20, padding: 20, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  dialogTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  dialogSubtitle: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  dialogOptionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  dialogOptionText: { color: colors.onSurface, fontSize: 15, fontWeight: "500", flex: 1 },
  dialogOkButton: { marginTop: 16, backgroundColor: colors.brandPrimary, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  dialogOkText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },

  // Share Schedule Modal Styles (Screenshot 5)
  shareHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  shareTabs: { flexDirection: "row", flex: 1, justifyContent: "center", gap: 16 },
  shareTab: { paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  shareTabActive: { borderBottomColor: colors.brandPrimary },
  shareTabText: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  shareTabTextActive: { color: colors.brandPrimary },
  shareOptionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  shareOptionText: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  sharePreviewCard: { width: "100%", maxWidth: 320, backgroundColor: colors.surfaceSecondary, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border },
  sharePreviewTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "700", marginBottom: 12 },
  sharePreviewBody: { color: colors.onSurface, fontSize: 14, lineHeight: 22, marginBottom: 16 },
  sharePreviewFooter: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  shareActionBar: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.divider },
  shareAppItem: { alignItems: "center", gap: 6 },
  shareAppIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  shareAppLabel: { color: colors.muted, fontSize: 11, fontWeight: "500" },
}));

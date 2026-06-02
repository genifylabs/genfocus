/**
 * GenFocus Dashboard Module
 * Manages stats computations, daily/longest streak algorithms,
 * and dynamically renders custom HTML/CSS bar charts and progress breakdowns.
 */

(function() {
  // DOM Elements
  const totalHoursDisplay = document.getElementById('stat-total-hours');
  const currentStreakDisplay = document.getElementById('stat-current-streak');
  const longestStreakDisplay = document.getElementById('stat-longest-streak');
  const barChartContainer = document.getElementById('bar-chart');
  const weeklyBreakdownContainer = document.getElementById('weekly-tag-breakdown');

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Helper: Formats seconds to beautiful hours and minutes
  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  // Helper: Get local date string 'YYYY-MM-DD' from Date object
  function getLocalDateString(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Calculates current and longest daily focus streaks
   * @param {Array} sessions list of completed focus sessions
   * @returns {Object} { currentStreak, longestStreak }
   */
  function calculateStreaks(sessions) {
    if (!sessions || sessions.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }
    
    // Extract all unique dates when focus was achieved, sorted ascending
    const uniqueDates = Array.from(
      new Set(sessions.map(s => getLocalDateString(new Date(s.date))))
    ).sort((a, b) => new Date(a) - new Date(b));
    
    if (uniqueDates.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }
    
    const activeDatesSet = new Set(uniqueDates);
    
    // 1. Current Streak Calculation
    const todayStr = getLocalDateString(new Date());
    
    const yesterday = new Date();
    yesterday.setTime(yesterday.getTime() - ONE_DAY_MS);
    const yesterdayStr = getLocalDateString(yesterday);
    
    let currentStreak = 0;
    let startStr = null;
    
    if (activeDatesSet.has(todayStr)) {
      startStr = todayStr;
    } else if (activeDatesSet.has(yesterdayStr)) {
      startStr = yesterdayStr;
    }
    
    if (startStr) {
      let checkDate = new Date(startStr);
      while (true) {
        const checkStr = getLocalDateString(checkDate);
        if (activeDatesSet.has(checkStr)) {
          currentStreak++;
          // Go back 1 day
          checkDate.setTime(checkDate.getTime() - ONE_DAY_MS);
        } else {
          break;
        }
      }
    }
    
    // 2. Longest Streak Calculation
    let longestStreak = 0;
    let currentContiguous = 0;
    let lastTime = null;
    
    uniqueDates.forEach((dateStr) => {
      const dateTime = new Date(dateStr).getTime();
      
      if (lastTime === null) {
        currentContiguous = 1;
      } else {
        const diffMs = dateTime - lastTime;
        const diffDays = Math.round(diffMs / ONE_DAY_MS);
        
        if (diffDays === 1) {
          currentContiguous++;
        } else if (diffDays > 1) {
          longestStreak = Math.max(longestStreak, currentContiguous);
          currentContiguous = 1;
        }
      }
      lastTime = dateTime;
    });
    
    longestStreak = Math.max(longestStreak, currentContiguous);
    
    return { currentStreak, longestStreak };
  }

  /**
   * Render the last 7 days focus minutes vertical bar chart
   * @param {Array} sessions list of focus sessions
   */
  function renderLast7DaysChart(sessions) {
    barChartContainer.innerHTML = '';
    
    // Create last 7 days timeline ending today
    const last7Days = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setTime(d.getTime() - i * ONE_DAY_MS);
      last7Days.push({
        dateStr: getLocalDateString(d),
        label: daysOfWeek[d.getDay()],
        minutes: 0
      });
    }
    
    // Aggregate sessions duration by day (in minutes)
    sessions.forEach(session => {
      const sessionDateStr = getLocalDateString(new Date(session.date));
      const dayMatch = last7Days.find(day => day.dateStr === sessionDateStr);
      if (dayMatch) {
        dayMatch.minutes += session.duration / 60;
      }
    });
    
    // Find maximum minutes for bar height scaling (minimum scaling factor is 60m)
    const maxMinutes = Math.max(...last7Days.map(d => d.minutes), 60);
    
    last7Days.forEach(day => {
      const heightPercent = (day.minutes / maxMinutes) * 100;
      const roundedMins = Math.round(day.minutes);
      
      const barCol = document.createElement('div');
      barCol.className = 'chart-bar-column';
      
      // Value text
      const valText = document.createElement('span');
      valText.className = 'chart-val';
      valText.textContent = roundedMins > 0 ? `${roundedMins}m` : '0m';
      
      // Bar container
      const barGlow = document.createElement('div');
      barGlow.className = 'chart-bar-glow-container';
      
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      
      barGlow.appendChild(bar);
      barCol.appendChild(valText);
      barCol.appendChild(barGlow);
      
      // Label text
      const lblText = document.createElement('span');
      lblText.className = 'chart-lbl';
      lblText.textContent = day.label;
      barCol.appendChild(lblText);
      
      barChartContainer.appendChild(barCol);
      
      // Trigger animated height layout after paint
      setTimeout(() => {
        bar.style.height = `${heightPercent}%`;
      }, 50);
    });
  }

  /**
   * Render weekly focus breakdown list by tag
   * @param {Array} sessions list of focus sessions
   */
  function renderWeeklyTagBreakdown(sessions) {
    weeklyBreakdownContainer.innerHTML = '';
    
    // Filter sessions in the last 7 days
    const nowTime = new Date().getTime();
    const weekAgoTime = nowTime - (7 * ONE_DAY_MS);
    
    const weeklySessions = sessions.filter(s => new Date(s.date).getTime() >= weekAgoTime);
    
    if (weeklySessions.length === 0) {
      weeklyBreakdownContainer.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <p>No focus activity recorded this week.</p>
        </div>
      `;
      return;
    }
    
    // Aggregate weekly seconds by tag
    const tagWeeklyDurations = {};
    let totalWeeklySeconds = 0;
    
    weeklySessions.forEach(s => {
      const tagId = s.tagId || 'tag-unknown';
      if (!tagWeeklyDurations[tagId]) {
        tagWeeklyDurations[tagId] = {
          name: s.tagName || 'Unknown',
          color: s.tagColor || '#64748b',
          seconds: 0
        };
      }
      tagWeeklyDurations[tagId].seconds += s.duration;
      totalWeeklySeconds += s.duration;
    });
    
    // Sort tags by duration descending
    const sortedTags = Object.values(tagWeeklyDurations).sort((a, b) => b.seconds - a.seconds);
    
    sortedTags.forEach(tag => {
      const percentage = Math.round((tag.seconds / totalWeeklySeconds) * 100);
      const durationText = formatDuration(tag.seconds);
      
      const item = document.createElement('div');
      item.className = 'breakdown-item';
      
      const header = document.createElement('div');
      header.className = 'breakdown-item-header';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'breakdown-item-name';
      
      const dot = document.createElement('span');
      dot.className = 'settings-tag-dot';
      dot.style.backgroundColor = tag.color;
      dot.style.boxShadow = `0 0 6px ${tag.color}`;
      
      const nameLabel = document.createTextNode(tag.name);
      nameSpan.appendChild(dot);
      nameSpan.appendChild(nameLabel);
      
      const valSpan = document.createElement('span');
      valSpan.className = 'breakdown-item-val';
      valSpan.textContent = `${durationText} (${percentage}%)`;
      
      header.appendChild(nameSpan);
      header.appendChild(valSpan);
      
      const track = document.createElement('div');
      track.className = 'progress-track';
      
      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.setProperty('--tag-color', tag.color);
      fill.style.boxShadow = `0 0 8px ${tag.color}4d`; // 30% alpha glow
      
      track.appendChild(fill);
      item.appendChild(header);
      item.appendChild(track);
      
      weeklyBreakdownContainer.appendChild(item);
      
      // Trigger animated width after layout paints
      setTimeout(() => {
        fill.style.width = `${percentage}%`;
      }, 50);
    });
  }

  /**
   * Recomputes all values and draws the dashboard visualizations
   */
  function refreshDashboard() {
    const sessions = window.FocusStorage.getSessions();
    
    // 1. Calculate total focus time
    const totalSeconds = sessions.reduce((sum, s) => sum + s.duration, 0);
    totalHoursDisplay.textContent = formatDuration(totalSeconds);
    
    // 2. Calculate streaks
    const { currentStreak, longestStreak } = calculateStreaks(sessions);
    currentStreakDisplay.textContent = `${currentStreak} day${currentStreak !== 1 ? 's' : ''}`;
    longestStreakDisplay.textContent = `${longestStreak} day${longestStreak !== 1 ? 's' : ''}`;
    
    // 3. Render last 7 days chart
    renderLast7DaysChart(sessions);
    
    // 4. Render weekly breakdown
    renderWeeklyTagBreakdown(sessions);
  }

  // Export to Global Namespace
  window.FocusDashboard = {
    refreshDashboard
  };
})();

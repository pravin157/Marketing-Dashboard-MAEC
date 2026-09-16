/**
 * Centralized SaaS Benchmarks Configuration
 */
const BENCHMARK_PROFILES = {
    "AEC SaaS": {
        metrics: {
            "users": {
                name: "Users",
                type: "none",
                label: "—"
            },
            "avg_engagement_time": {
                name: "Avg Engagement Time",
                type: "numeric",
                min: 45,
                max: 90,
                label: "45–90s (SaaS goal)",
                unit: "s"
            },
            "views_per_user": {
                name: "Views/User",
                type: "numeric",
                min: 2,
                max: 4,
                label: "2–4 (SaaS typical)",
                unit: ""
            },
            "demo_page_views": {
                name: "Demo Page Views",
                type: "signal",
                label: "High intent signal"
            }
        }
    },
    "Construction SaaS": {
        metrics: {
            "users": { name: "Users", type: "none", label: "—" },
            "avg_engagement_time": { name: "Avg Engagement Time", type: "numeric", min: 50, max: 100, label: "50–100s", unit: "s" },
            "views_per_user": { name: "Views/User", type: "numeric", min: 2.5, max: 5.0, label: "2.5–5.0", unit: "" },
            "demo_page_views": { name: "Demo Page Views", type: "signal", label: "High intent signal" }
        }
    },
    "Architecture SaaS": {
        metrics: {
            "users": { name: "Users", type: "none", label: "—" },
            "avg_engagement_time": { name: "Avg Engagement Time", type: "numeric", min: 40, max: 80, label: "40–80s", unit: "s" },
            "views_per_user": { name: "Views/User", type: "numeric", min: 1.8, max: 3.5, label: "1.8–3.5", unit: "" },
            "demo_page_views": { name: "Demo Page Views", type: "signal", label: "High intent signal" }
        }
    },
    "Engineering SaaS": {
        metrics: {
            "users": { name: "Users", type: "none", label: "—" },
            "avg_engagement_time": { name: "Avg Engagement Time", type: "numeric", min: 45, max: 90, label: "45–90s", unit: "s" },
            "views_per_user": { name: "Views/User", type: "numeric", min: 2.0, max: 4.0, label: "2.0–4.0", unit: "" },
            "demo_page_views": { name: "Demo Page Views", type: "signal", label: "High intent signal" }
        }
    },
    "General SaaS": {
        metrics: {
            "users": { name: "Users", type: "none", label: "—" },
            "avg_engagement_time": { name: "Avg Engagement Time", type: "numeric", min: 60, max: 120, label: "60–120s", unit: "s" },
            "views_per_user": { name: "Views/User", type: "numeric", min: 3.0, max: 6.0, label: "3.0–6.0", unit: "" },
            "demo_page_views": { name: "Demo Page Views", type: "signal", label: "High intent signal" }
        }
    }
};

const ACTIVE_BENCHMARK_PROFILE = "AEC SaaS";

// Centralized comparison and status logic
class BenchmarkService {
    static getProfile(profileName = ACTIVE_BENCHMARK_PROFILE) {
        return BENCHMARK_PROFILES[profileName] || BENCHMARK_PROFILES["AEC SaaS"];
    }

    static compare(metricKey, currentValue, profileName = ACTIVE_BENCHMARK_PROFILE) {
        const profile = this.getProfile(profileName);
        const metricConfig = profile.metrics[metricKey];
        if (!metricConfig) {
            return { status: "No benchmark", label: "—" };
        }

        if (metricConfig.type === "none") {
            return { status: "No benchmark", label: metricConfig.label };
        }

        if (metricConfig.type === "signal") {
            return { status: "No benchmark", label: metricConfig.label };
        }

        if (currentValue === null || currentValue === undefined || isNaN(currentValue)) {
            return { status: "No benchmark", label: metricConfig.label };
        }

        const min = metricConfig.min;
        const max = metricConfig.max;

        if (currentValue < min) {
            return { status: "Below benchmark", label: metricConfig.label };
        } else if (currentValue >= min && currentValue <= max) {
            return { status: "Within benchmark", label: metricConfig.label };
        } else {
            return { status: "Above benchmark", label: metricConfig.label };
        }
    }
}

// Export for Node environments, or expose globally for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BENCHMARK_PROFILES, ACTIVE_BENCHMARK_PROFILE, BenchmarkService };
} else {
    // Expose on window in browser
    window.BENCHMARK_PROFILES = BENCHMARK_PROFILES;
    window.ACTIVE_BENCHMARK_PROFILE = ACTIVE_BENCHMARK_PROFILE;
    window.BenchmarkService = BenchmarkService;
}

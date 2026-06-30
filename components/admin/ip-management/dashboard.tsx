"use client"

import { useState } from "react"
import { BlacklistTab } from "./blacklist-tab"
import { WhitelistTab } from "./whitelist-tab"
import { ActivityLogTab } from "./activity-log-tab"
import {
  IpBlocklistEntry,
  IpWhitelistEntry,
  IpActivityLogEntry,
} from "@/lib/db/queries/security"

interface IPManagementDashboardProps {
  initialData: {
    blacklist: IpBlocklistEntry[]
    whitelist: IpWhitelistEntry[]
    activityLog: IpActivityLogEntry[]
  }
}

export function IPManagementDashboard({ initialData }: IPManagementDashboardProps) {
  const [activeTab, setActiveTab] = useState("blacklist")

  const tabs = [
    { id: "blacklist", label: "IPs Bloqueadas" },
    { id: "whitelist", label: "IPs Permitidas" },
    { id: "activity", label: "Activity Log" },
  ]

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold mb-4">Gestión de IPs</h1>
        <div className="flex gap-4 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 px-4 transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-500 font-bold text-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === "blacklist" && (
          <BlacklistTab data={initialData.blacklist} />
        )}
        {activeTab === "whitelist" && (
          <WhitelistTab data={initialData.whitelist} />
        )}
        {activeTab === "activity" && (
          <ActivityLogTab data={initialData.activityLog} />
        )}
      </div>
    </div>
  )
}

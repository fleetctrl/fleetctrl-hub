"use client";
import { useState } from "react";

enum Tab {
  OVERVIEW,
}

export default function Tabs() {
  const [tab, setTab] = useState(Tab.OVERVIEW);
  return (
    <>
      <div>
        <ul>
          <li onClick={() => setTab(Tab.OVERVIEW)}>Overview</li>
        </ul>
      </div>
      <div>{tab === Tab.OVERVIEW && <div>Overview</div>}</div>
    </>
  );
}

"use client";

import { useEffect } from "react";

import { hasLatinText, toChineseDisplay } from "@/lib/chineseDisplay";

const ignoredTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "NOSCRIPT"]);
const maxTextNodesPerFlush = 220;
const flushDelayMs = 160;

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function VisibleTextSanitizer() {
  useEffect(() => {
    const pendingRoots = new Set<ParentNode>();
    const processedValues = new WeakMap<Text, string>();
    const idleWindow = window as IdleWindow;
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;

    const sanitizeTextNode = (node: Text) => {
      const value = node.nodeValue;
      if (!value || !hasLatinText(value)) return;
      if (processedValues.get(node) === value) return;
      node.nodeValue = toChineseDisplay(value, "待接入中文名");
      processedValues.set(node, node.nodeValue ?? "");
    };

    const sanitizeTree = (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || ignoredTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          return hasLatinText(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });

      const nodes: Text[] = [];
      while (nodes.length < maxTextNodesPerFlush && walker.nextNode()) {
        nodes.push(walker.currentNode as Text);
      }
      nodes.forEach(sanitizeTextNode);
    };

    const flush = () => {
      idleHandle = undefined;
      timeoutHandle = undefined;
      document.title = toChineseDisplay(document.title, "世界杯智能推算");
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      roots.forEach(sanitizeTree);
    };

    const scheduleFlush = (root: ParentNode) => {
      pendingRoots.add(root);
      if (idleHandle !== undefined || timeoutHandle !== undefined) return;

      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(flush, { timeout: 700 });
        return;
      }

      timeoutHandle = window.setTimeout(flush, flushDelayMs);
    };

    scheduleFlush(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const parent = (node as Text).parentElement;
            if (parent) scheduleFlush(parent);
          } else if (node.nodeType === Node.ELEMENT_NODE && !ignoredTags.has((node as Element).tagName)) {
            scheduleFlush(node as Element);
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (idleHandle !== undefined && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    };
  }, []);

  return null;
}

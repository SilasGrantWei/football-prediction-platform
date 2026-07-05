"use client";

import { useEffect } from "react";

import { hasLatinText, toChineseDisplay } from "@/lib/chineseDisplay";

const ignoredTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "NOSCRIPT"]);

export function VisibleTextSanitizer() {
  useEffect(() => {
    const sanitizeTextNode = (node: Text) => {
      const value = node.nodeValue;
      if (!value || !hasLatinText(value)) return;
      node.nodeValue = toChineseDisplay(value, "待补中文名");
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
      while (walker.nextNode()) {
        nodes.push(walker.currentNode as Text);
      }
      nodes.forEach(sanitizeTextNode);
    };

    document.title = toChineseDisplay(document.title, "世界杯智能推算");
    sanitizeTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            sanitizeTextNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE && !ignoredTags.has((node as Element).tagName)) {
            sanitizeTree(node as Element);
          }
        });

        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          sanitizeTextNode(mutation.target as Text);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

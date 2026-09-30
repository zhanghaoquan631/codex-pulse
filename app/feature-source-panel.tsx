"use client";
import { useState } from 'react';
import { Code2 } from 'lucide-react';
import catalog from '@/lib/feature-source-catalog.json';
import SourceActions from './source-actions';

export default function FeatureSourcePanel({ section }: { section: string }) {
  const group = catalog.sections.find(item => item.id === section);
  const [chosen, setChosen] = useState('');
  if (!group) return null;
  const current = group.items.find(item => item.id === chosen) ?? group.items[0];
  return <section className="feature-source-panel" aria-label={`${group.title}源码与提示词`} data-source-section={section}>
    <div className="feature-source-heading"><span><Code2 size={18}/><strong>{group.title} · 源码与提示词</strong></span><label>功能板块<select aria-label={`${group.title}源码范围`} value={current.id} onChange={event => setChosen(event.target.value)}>{group.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
    <p className="feature-source-description">{current.requirements}。</p>
    <SourceActions key={current.id} project={current.id}/>
  </section>;
}

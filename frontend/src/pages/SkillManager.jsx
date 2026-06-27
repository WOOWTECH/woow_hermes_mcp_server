import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Search,
  Loader2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Download,
  X,
} from 'lucide-react';
import { apiGet, apiPut, apiPost } from '../api';

const CATEGORIES = ['all', 'woowtech', 'superpowers', 'builtin'];

function SkillRow({ skill, onToggle, isPending, mutationPending }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors">
        <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200 font-mono">
                {skill.name}
              </span>
              {skill.category && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded border ${
                    skill.category === 'woowtech'
                      ? 'bg-brand-600/20 text-brand-400 border-brand-600/30'
                      : skill.category === 'superpowers'
                      ? 'bg-purple-600/20 text-purple-400 border-purple-600/30'
                      : 'bg-gray-700 text-gray-400 border-gray-600'
                  }`}
                >
                  {skill.category}
                </span>
              )}
            </div>
            {skill.description && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{skill.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => onToggle(skill.name, skill.enabled)}
          disabled={isPending || mutationPending}
          className="shrink-0 disabled:opacity-50 transition-opacity"
          title={skill.enabled ? 'Disable skill' : 'Enable skill'}
        >
          {isPending ? (
            <Loader2 size={24} className="animate-spin text-gray-500" />
          ) : skill.enabled ? (
            <ToggleRight size={28} className="text-brand-500" />
          ) : (
            <ToggleLeft size={28} className="text-gray-600" />
          )}
        </button>
      </div>
      {expanded && skill.content && (
        <div className="px-4 pb-3 pl-10">
          <pre className="text-xs text-gray-400 bg-gray-800/50 border border-gray-700 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {skill.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function InstallModal({ onClose }) {
  const [hubSearch, setHubSearch] = useState('');
  const [results, setResults] = useState(null);

  const searchMutation = useMutation({
    mutationFn: (query) => apiGet(`/skills/hub?q=${encodeURIComponent(query)}`),
    onSuccess: (data) => setResults(data.skills || []),
  });

  const installMutation = useMutation({
    mutationFn: (skillId) => apiPost('/skills/install', { skill_id: skillId }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-gray-100">Install from Hub</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={hubSearch}
                onChange={(e) => setHubSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && hubSearch.trim() && searchMutation.mutate(hubSearch)}
                placeholder="Search skill hub..."
                className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
            </div>
            <button
              onClick={() => hubSearch.trim() && searchMutation.mutate(hubSearch)}
              disabled={searchMutation.isPending || !hubSearch.trim()}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {searchMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                'Search'
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {results === null ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              Search for skills to install
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No skills found
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((skill) => (
                <div
                  key={skill.id || skill.name}
                  className="flex items-center justify-between px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <span className="text-sm font-medium text-gray-200">{skill.name}</span>
                    {skill.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{skill.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => installMutation.mutate(skill.id || skill.name)}
                    disabled={installMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                  >
                    {installMutation.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    Install
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SkillManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [pendingToggles, setPendingToggles] = useState({});
  const [showInstallModal, setShowInstallModal] = useState(false);

  const { data: skillsData, isLoading, error, refetch } = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet('/skills'),
  });

  const mutation = useMutation({
    mutationFn: (skills) => apiPut('/skills', { skills }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setPendingToggles({});
    },
    onError: () => {
      setPendingToggles({});
    },
  });

  const skills = skillsData?.skills || [];

  const filteredSkills = useMemo(() => {
    let result = skills;
    if (category !== 'all') {
      result = result.filter((s) => s.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [skills, search, category]);

  function handleToggle(skillName, currentEnabled) {
    const newEnabled = !currentEnabled;
    setPendingToggles((prev) => ({ ...prev, [skillName]: true }));
    const updatedSkills = skills.map((s) =>
      s.name === skillName ? { ...s, enabled: newEnabled } : s
    );
    mutation.mutate(updatedSkills);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-500" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400 font-medium">Failed to load skills</p>
        <p className="text-red-400/70 text-sm mt-1">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Skill Manager</h2>
          <p className="text-sm text-gray-500 mt-1">
            {enabledCount} of {skills.length} skills enabled
          </p>
        </div>
        <button
          onClick={() => setShowInstallModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-lg text-sm transition-colors"
        >
          <Download size={14} />
          <span>Install from Hub</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
          />
        </div>
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                category === cat
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Skills List */}
      {filteredSkills.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
          <p>No skills match your search</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {filteredSkills.map((skill) => (
            <SkillRow
              key={skill.name}
              skill={skill}
              onToggle={handleToggle}
              isPending={pendingToggles[skill.name]}
              mutationPending={mutation.isPending}
            />
          ))}
        </div>
      )}

      {showInstallModal && (
        <InstallModal onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
}

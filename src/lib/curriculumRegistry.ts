import type { Subject, Topic } from '../types';
import { SUBJECT_MAP, SUBJECTS, TOPIC_MAP, TOPICS } from '../data/curriculum';

/**
 * The app is a single active workspace per browser session. Display helpers
 * read this registry so cards, labels and analytics can stay generic without
 * threading the full AppState through every small component.
 */
let currentSubjects: Subject[] = SUBJECTS;
let currentTopics: Topic[] = TOPICS;
let currentSubjectMap = new Map(currentSubjects.map((subject) => [subject.id, subject]));
let currentTopicMap = new Map(currentTopics.map((topic) => [topic.id, topic]));

export function setCurriculumRegistry(subjects: Subject[], topics: Topic[]): void {
  currentSubjects = subjects;
  currentTopics = topics;
  currentSubjectMap = new Map(currentSubjects.map((subject) => [subject.id, subject]));
  currentTopicMap = new Map(currentTopics.map((topic) => [topic.id, topic]));
}

export function registrySubjects(): Subject[] {
  return currentSubjects;
}

export function registryTopics(): Topic[] {
  return currentTopics;
}

export function registrySubjectMap(): Map<string, Subject> {
  return currentSubjectMap;
}

export function registryTopicMap(): Map<string, Topic> {
  return currentTopicMap;
}

export function lookupSubject(id?: string): Subject | undefined {
  if (!id) return undefined;
  return currentSubjectMap.get(id) ?? SUBJECT_MAP[id];
}

export function lookupTopic(id?: string): Topic | undefined {
  if (!id) return undefined;
  return currentTopicMap.get(id) ?? TOPIC_MAP.get(id);
}

export function registryTotalUnits(): number {
  return currentTopics.reduce((sum, topic) => sum + topic.units, 0);
}

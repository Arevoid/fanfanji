/** Serialize pending edits and reply snapshots so a request never reads half an edit. */
export function createPendingMessageMutationQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task:()=>Promise<T>|T):Promise<T> => {
    const next=tail.then(task);
    tail=next.catch(()=>undefined);
    return next;
  };
}

export default function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
      <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#06b6d4] p-1">
        <div className="w-full h-full bg-[#06b6d4] rounded-full animate-pulse shadow-[0_0_15px_#06b6d4]" />
      </div>
    </div>
  );
}

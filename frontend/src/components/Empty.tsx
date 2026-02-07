interface EmptyProps {
  name: string;
}

export default function Empty({ name }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
      <h2 className="text-xl font-semibold text-gray-400">No {name} found.</h2>
    </div>
  );
}

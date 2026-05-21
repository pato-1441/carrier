export type Load = {
  load_id: string;
  origin: string;
  destination: string;
  pickup_datetime: string;
  delivery_datetime: string;
  equipment_type: string;
  loadboard_rate: number;
  notes: string;
  weight: number;
  commodity_type: string;
};

export type McValidationResult = {
  input: string;
  normalized_mc_number: string;
  docket_number: string;
  valid_format: boolean;
  found: boolean;
  carrier: null | {
    legal_name: string | null;
    dba_name: string | null;
    dot_number: number | null;
    mc_number: number | null;
    allowed_to_operate: boolean | null;
    out_of_service: boolean | null;
    phone: string | null;
    address: {
      street: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      country: string | null;
    };
  };
};
